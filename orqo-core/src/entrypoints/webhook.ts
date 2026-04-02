import { createServer } from 'node:http';
import { createIngestInboundMessageCommand } from '../application/commands/ingest-message/IngestInboundMessageCommand.js';
import { Container } from '../infrastructure/container/Container.js';
import {
  normalizeWhatsAppWebhook,
  type WhatsAppWebhookPayload,
} from '../infrastructure/messaging/WhatsAppWebhookNormalizer.js';
import { MetricsRegistry } from '../shared/Metrics.js';
import { createLogger } from '../shared/Logger.js';

const VERIFY_TOKEN = process.env['WHATSAPP_VERIFY_TOKEN'] ?? 'orqo-dev-token';
const log = createLogger('orqo-core:webhook');

async function start() {
  const container = await Container.build();
  container.inboundMessageWorker.startPolling(
    Number(process.env['INBOUND_WORKER_POLL_MS'] ?? 250),
  );

  const webhookRequests = MetricsRegistry.default.counter(
    'orqo_webhook_requests_total',
    'Total de requests recibidos en el webhook',
    ['method', 'path', 'status'],
  );

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

    // ── Verificación Meta ─────────────────────────────────────────────────────
    if (req.method === 'GET' && url.pathname === '/webhook/whatsapp') {
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');

      if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        webhookRequests.inc({ method: 'GET', path: '/webhook/whatsapp', status: '200' });
        res.writeHead(200).end(challenge ?? '');
      } else {
        webhookRequests.inc({ method: 'GET', path: '/webhook/whatsapp', status: '403' });
        res.writeHead(403).end('Forbidden');
      }
      return;
    }

    // ── Health check avanzado ─────────────────────────────────────────────────
    if (req.method === 'GET' && url.pathname === '/healthz') {
      const report = await container.healthChecker.run();
      const httpStatus = report.status === 'unhealthy' ? 503 : 200;
      res.writeHead(httpStatus, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(report));
      return;
    }

    // ── Métricas Prometheus ───────────────────────────────────────────────────
    if (req.method === 'GET' && url.pathname === '/metrics') {
      const text = MetricsRegistry.default.toPrometheusText();
      res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
      res.end(text);
      return;
    }

    // ── Ingreso de mensajes WhatsApp ──────────────────────────────────────────
    if (req.method === 'POST' && url.pathname === '/webhook/whatsapp') {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
      }

      res.writeHead(200).end('OK');

      try {
        const payload = JSON.parse(body) as WhatsAppWebhookPayload;
        const normalizationResult = normalizeWhatsAppWebhook(payload);
        if (!normalizationResult.ok) {
          log.error('Error normalizando payload de webhook', {
            error: normalizationResult.error.message,
          });
          webhookRequests.inc({ method: 'POST', path: '/webhook/whatsapp', status: 'normalize_error' });
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
            webhookRequests.inc({ method: 'POST', path: '/webhook/whatsapp', status: 'enqueue_error' });
          } else {
            webhookRequests.inc({ method: 'POST', path: '/webhook/whatsapp', status: '200' });
          }
        }
      } catch (error) {
        log.error('Error parseando payload del webhook', {
          error: error instanceof Error ? error.message : String(error),
        });
        webhookRequests.inc({ method: 'POST', path: '/webhook/whatsapp', status: 'parse_error' });
      }
      return;
    }

    res.writeHead(404).end('Not Found');
  });

  const port = Number(process.env['PORT'] ?? 3001);
  server.listen(port, () => {
    log.info('Servidor iniciado', {
      port,
      endpoints: ['/webhook/whatsapp', '/healthz', '/metrics'],
    });
  });
}

start().catch(error => {
  log.error('Error fatal de arranque', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
