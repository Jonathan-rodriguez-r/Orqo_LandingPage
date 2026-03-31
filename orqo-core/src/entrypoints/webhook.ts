/**
 * Entrypoint HTTP — recibe webhooks de WhatsApp (Meta Cloud API).
 *
 * Este archivo es Infraestructura pura: convierte el payload HTTP en un Command
 * y lo despacha al CommandBus. No contiene lógica de negocio.
 *
 * En producción puede ser:
 *   - Un servidor Node.js standalone (este archivo)
 *   - Un Next.js Route Handler en orqo-dashboard/app/api/webhook/whatsapp/route.ts
 */
import { createServer } from 'node:http';
import { Container } from '../infrastructure/container/Container.js';
import { createProcessIncomingMessageCommand } from '../application/commands/process-message/ProcessIncomingMessageCommand.js';

const VERIFY_TOKEN = process.env['WHATSAPP_VERIFY_TOKEN'] ?? 'orqo-dev-token';

async function start() {
  const container = await Container.build();

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

    // ── GET: verificación del webhook por Meta ─────────────────────────────
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

    // ── POST: mensaje entrante de WhatsApp ─────────────────────────────────
    if (req.method === 'POST' && url.pathname === '/webhook/whatsapp') {
      let body = '';
      for await (const chunk of req) body += chunk;

      res.writeHead(200).end('OK'); // Ack inmediato a Meta (< 20s)

      try {
        const payload = JSON.parse(body) as WhatsAppWebhookPayload;
        const entries = payload.entry ?? [];

        for (const entry of entries) {
          for (const change of entry.changes ?? []) {
            const messages = change.value?.messages ?? [];
            const metadata = change.value?.metadata;

            for (const msg of messages) {
              if (msg.type !== 'text') continue; // solo texto por ahora

              const command = createProcessIncomingMessageCommand(
                metadata?.phone_number_id ?? 'default', // workspaceId = phoneNumberId del negocio
                msg.from,
                msg.text?.body ?? '',
                msg.id,
                new Date(Number(msg.timestamp) * 1000),
              );

              const result = await container.commandBus.dispatch(command);
              if (!result.ok) {
                console.error('[Webhook] Error procesando mensaje:', result.error.message);
              }
            }
          }
        }
      } catch (e) {
        console.error('[Webhook] Error parseando payload:', e);
      }
      return;
    }

    res.writeHead(404).end('Not Found');
  });

  const port = process.env['PORT'] ?? 3001;
  server.listen(port, () => {
    console.info(`[ORQO Core] Webhook escuchando en http://localhost:${port}`);
  });
}

// ── Tipos del payload de Meta ──────────────────────────────────────────────

interface WhatsAppWebhookPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{
          id: string;
          from: string;
          timestamp: string;
          type: string;
          text?: { body: string };
        }>;
        metadata?: { phone_number_id: string };
      };
    }>;
  }>;
}

start().catch(e => {
  console.error('[ORQO Core] Error de arranque:', e);
  process.exit(1);
});
