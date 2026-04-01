import { createServer } from 'node:http';
import { createIngestInboundMessageCommand } from '../application/commands/ingest-message/IngestInboundMessageCommand.js';
import { Container } from '../infrastructure/container/Container.js';
import {
  normalizeWhatsAppWebhook,
  type WhatsAppWebhookPayload,
} from '../infrastructure/messaging/WhatsAppWebhookNormalizer.js';

const VERIFY_TOKEN = process.env['WHATSAPP_VERIFY_TOKEN'] ?? 'orqo-dev-token';

async function start() {
  const container = await Container.build();
  container.inboundMessageWorker.startPolling(
    Number(process.env['INBOUND_WORKER_POLL_MS'] ?? 250),
  );

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

    if (req.method === 'GET' && url.pathname === '/webhook/whatsapp') {
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');

      if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        res.writeHead(200).end(challenge ?? '');
      } else {
        res.writeHead(403).end('Forbidden');
      }
      return;
    }

    if (req.method === 'GET' && url.pathname === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'orqo-core' }));
      return;
    }

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
          console.error(
            '[Webhook] Error normalizando payload:',
            normalizationResult.error.message,
          );
          return;
        }

        for (const envelope of normalizationResult.value) {
          const result = await container.commandBus.dispatch(
            createIngestInboundMessageCommand(envelope),
          );
          if (!result.ok) {
            console.error('[Webhook] Error encolando mensaje:', result.error.message);
          }
        }
      } catch (error) {
        console.error('[Webhook] Error parseando payload:', error);
      }
      return;
    }

    res.writeHead(404).end('Not Found');
  });

  const port = Number(process.env['PORT'] ?? 3001);
  server.listen(port, () => {
    console.info(`[ORQO Core] Escuchando en http://localhost:${port}`);
  });
}

start().catch(error => {
  console.error('[ORQO Core] Error de arranque:', error);
  process.exit(1);
});
