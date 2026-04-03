import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createIngestInboundMessageCommand } from '../application/commands/ingest-message/IngestInboundMessageCommand.js';
import { Container } from '../infrastructure/container/Container.js';
import {
  normalizeWhatsAppWebhook,
  type WhatsAppWebhookPayload,
} from '../infrastructure/messaging/WhatsAppWebhookNormalizer.js';
import {
  normalizeInstagramWebhook,
  type InstagramWebhookPayload,
} from '../infrastructure/messaging/MetaInstagramNormalizer.js';
import {
  normalizeMessengerWebhook,
  type MessengerWebhookPayload,
} from '../infrastructure/messaging/MetaMessengerNormalizer.js';
import { MetricsRegistry } from '../shared/Metrics.js';
import { createLogger } from '../shared/Logger.js';

const VERIFY_TOKEN = process.env['WHATSAPP_VERIFY_TOKEN'] ?? 'orqo-dev-token';
const log = createLogger('orqo-core:webhook');

// El container se inicializa de forma asíncrona después de que el servidor ya esté escuchando.
// Esto permite que Railway complete el healthcheck de /ping mientras el core conecta MongoDB.
let container: Container | null = null;
let initError: Error | null = null;

const webhookRequests = MetricsRegistry.default.counter(
  'orqo_webhook_requests_total',
  'Total de requests recibidos en el webhook',
  ['method', 'path', 'status'],
);

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const method = req.method ?? 'GET';

  // ── Ping inmediato — no requiere container ────────────────────────────────
  if (method === 'GET' && url.pathname === '/ping') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // ── Status page — muestra config enmascarada ──────────────────────────────
  if (method === 'GET' && (url.pathname === '/' || url.pathname === '')) {
    const mask = (v: string | undefined, show = 4) =>
      v ? (v.length > show ? `${'·'.repeat(6)}${v.slice(-show)}` : '****') : '—no configurado—';
    const status = initError ? 'error' : container ? 'running' : 'starting';
    const statusColor = status === 'running' ? '#2CB978' : status === 'error' ? '#DC4848' : '#F5B43C';
    const env = {
      NODE_ENV: process.env['NODE_ENV'] ?? '—',
      ORQO_SERVICE: process.env['ORQO_SERVICE'] ?? 'webhook',
      PORT: process.env['PORT'] ?? '3001',
      MONGODB_URI: mask(process.env['MONGODB_URI'], 8),
      ANTHROPIC_API_KEY: mask(process.env['ANTHROPIC_API_KEY']),
      OPENAI_API_KEY: mask(process.env['OPENAI_API_KEY']),
      ORQO_ENCRYPTION_KEY: process.env['ORQO_ENCRYPTION_KEY'] ? '✓ configurado' : '—no configurado—',
      WHATSAPP_VERIFY_TOKEN: mask(process.env['WHATSAPP_VERIFY_TOKEN']),
    };
    const rows = Object.entries(env).map(([k, v]) =>
      `<tr><td style="color:#7A9488;padding:6px 14px 6px 0;font-family:monospace;font-size:13px;white-space:nowrap">${k}</td><td style="color:#E9EDE9;padding:6px 0;font-family:monospace;font-size:13px">${v}</td></tr>`
    ).join('');
    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>ORQO Core</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{background:#060908;color:#E9EDE9;font-family:'Figtree',system-ui,sans-serif;padding:48px 24px;min-height:100vh}
.card{background:#0B100D;border:1px solid #1D2920;border-radius:14px;padding:24px 28px;max-width:640px;margin:0 auto}
h1{font-size:20px;font-weight:700;color:#F5F5F2;margin-bottom:4px}
.sub{font-size:13px;color:#7A9488;margin-bottom:24px}
.status{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;padding:3px 10px;border-radius:20px;background:${statusColor}18;color:${statusColor};border:1px solid ${statusColor}44;margin-left:10px}
.dot{width:7px;height:7px;border-radius:50%;background:${statusColor}}
table{width:100%;border-collapse:collapse}
tr{border-bottom:1px solid #1D2920}tr:last-child{border-bottom:none}
.endpoints{margin-top:20px;font-size:12px;color:#7A9488;line-height:2}
code{color:#2CB978;font-family:monospace;font-size:12px}
</style></head><body><div class="card">
<div style="display:flex;align-items:center;margin-bottom:4px">
<h1>ORQO Core</h1>
<span class="status"><span class="dot"></span>${status}</span>
</div>
<div class="sub">Motor de orquestación de agentes IA</div>
${initError ? `<div style="background:rgba(220,72,72,0.1);border:1px solid rgba(220,72,72,0.3);border-radius:8px;padding:12px 14px;margin-bottom:20px;font-size:12.5px;color:#DC4848">${initError.message}</div>` : ''}
<table>${rows}</table>
<div class="endpoints">
<b style="color:#B4C4BC">Endpoints</b><br>
<code>GET  /ping</code> — healthcheck inmediato<br>
<code>GET  /healthz</code> — estado MongoDB + cola<br>
<code>GET  /metrics</code> — Prometheus metrics<br>
<code>POST /webhook/meta</code> — webhook Meta (WhatsApp · IG · Messenger)<br>
<code>GET  /webhook/meta</code> — verificación Meta
</div>
</div></body></html>`;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  // ── Verificación Meta (GET) — /webhook/meta y alias /webhook/whatsapp ─────
  if (method === 'GET' && (url.pathname === '/webhook/meta' || url.pathname === '/webhook/whatsapp')) {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      webhookRequests.inc({ method: 'GET', path: url.pathname, status: '200' });
      res.writeHead(200).end(challenge ?? '');
    } else {
      webhookRequests.inc({ method: 'GET', path: url.pathname, status: '403' });
      res.writeHead(403).end('Forbidden');
    }
    return;
  }

  // ── Health check avanzado ─────────────────────────────────────────────────
  if (method === 'GET' && url.pathname === '/healthz') {
    if (initError) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'unhealthy', error: initError.message }));
      return;
    }
    if (!container) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'starting' }));
      return;
    }
    const report = await container.healthChecker.run();
    const httpStatus = report.status === 'unhealthy' ? 503 : 200;
    res.writeHead(httpStatus, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(report));
    return;
  }

  // ── Métricas Prometheus ───────────────────────────────────────────────────
  if (method === 'GET' && url.pathname === '/metrics') {
    const text = MetricsRegistry.default.toPrometheusText();
    res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
    res.end(text);
    return;
  }

  // ── Rutas que requieren container inicializado ────────────────────────────
  if (!container) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Service initializing, retry in a few seconds' }));
    return;
  }

  // ── Ingreso de mensajes Meta (WhatsApp + Instagram + Messenger) ───────────
  // Accepts both /webhook/meta (new) and /webhook/whatsapp (legacy alias)
  if (method === 'POST' && (url.pathname === '/webhook/meta' || url.pathname === '/webhook/whatsapp')) {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
    }

    res.writeHead(200).end('OK');

    try {
      const payload = JSON.parse(body) as Record<string, unknown>;
      const objectType = payload['object'];

      let normalizationResult;

      if (objectType === 'instagram') {
        normalizationResult = await normalizeInstagramWebhook(
          payload as InstagramWebhookPayload,
          container.channelRouter,
        );
      } else if (objectType === 'page') {
        normalizationResult = await normalizeMessengerWebhook(
          payload as MessengerWebhookPayload,
          container.channelRouter,
        );
      } else {
        // Default: whatsapp_business_account or unknown — try WhatsApp normalizer
        normalizationResult = await normalizeWhatsAppWebhook(
          payload as WhatsAppWebhookPayload,
          container.channelRouter,
        );
      }

      if (!normalizationResult.ok) {
        log.error('Error normalizando payload de webhook', {
          error: normalizationResult.error.message,
          objectType,
        });
        webhookRequests.inc({ method: 'POST', path: url.pathname, status: 'normalize_error' });
        return;
      }

      for (const envelope of normalizationResult.value) {
        const result = await container.commandBus.dispatch(
          createIngestInboundMessageCommand(envelope),
        );
        if (!result.ok) {
          log.error('Error encolando mensaje', {
            error: result.error.message,
            correlationId: envelope.externalMessageId,
            workspaceId: envelope.workspaceId,
          });
          webhookRequests.inc({ method: 'POST', path: url.pathname, status: 'enqueue_error' });
        } else {
          webhookRequests.inc({ method: 'POST', path: url.pathname, status: '200' });
        }
      }
    } catch (error) {
      log.error('Error parseando payload del webhook', {
        error: error instanceof Error ? error.message : String(error),
      });
      webhookRequests.inc({ method: 'POST', path: url.pathname, status: 'parse_error' });
    }
    return;
  }

  res.writeHead(404).end('Not Found');
}

async function start() {
  const port = Number(process.env['PORT'] ?? 3001);

  // 1. Levanta el servidor HTTP inmediatamente — Railway puede hacer healthcheck en /ping
  const server = createServer((req, res) => {
    void handleRequest(req, res).catch(err => {
      log.error('Error no capturado en request', {
        error: err instanceof Error ? err.message : String(err),
      });
      if (!res.headersSent) res.writeHead(500).end('Internal Server Error');
    });
  });

  server.listen(port, () => {
    log.info('Servidor HTTP escuchando', { port });
  });

  // 2. Inicializa el container en segundo plano (conecta MongoDB, etc.)
  Container.build()
    .then(c => {
      container = c;
      container.inboundMessageWorker.startPolling(
        Number(process.env['INBOUND_WORKER_POLL_MS'] ?? 250),
      );
      log.info('Container inicializado — sistema listo', {
        endpoints: ['/webhook/meta', '/webhook/whatsapp', '/healthz', '/metrics', '/ping'],
      });
    })
    .catch((err: unknown) => {
      initError = err instanceof Error ? err : new Error(String(err));
      log.error('Error fatal inicializando container', { error: initError.message });
      // No hacemos process.exit — el servidor sigue vivo para responder /healthz con 503
    });
}

start().catch(error => {
  log.error('Error fatal de arranque', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
