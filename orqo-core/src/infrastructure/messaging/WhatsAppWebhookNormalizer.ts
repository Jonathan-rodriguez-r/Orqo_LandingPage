import { CanonicalMessageEnvelope } from '../../domain/messaging/entities/CanonicalMessageEnvelope.js';
import { Err, Ok, type Result } from '../../shared/Result.js';

export interface WhatsAppWebhookPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{
          id?: string;
          from?: string;
          timestamp?: string;
          type?: string;
          text?: { body?: string };
        }>;
        metadata?: { phone_number_id?: string };
      };
    }>;
  }>;
}

export function normalizeWhatsAppWebhook(
  payload: WhatsAppWebhookPayload,
): Result<CanonicalMessageEnvelope[]> {
  const envelopes: CanonicalMessageEnvelope[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const workspaceId = change.value?.metadata?.phone_number_id?.trim();
      if (!workspaceId) {
        return Err(new Error('El webhook de WhatsApp no trae phone_number_id'));
      }

      for (const message of change.value?.messages ?? []) {
        if (message.type !== 'text') {
          continue;
        }

        const envelopeResult = CanonicalMessageEnvelope.create({
          workspaceId,
          providerAccountId: workspaceId,
          externalMessageId: message.id ?? '',
          customerPhone: message.from ?? '',
          occurredAt: new Date(Number(message.timestamp) * 1000),
          payload: {
            type: 'text',
            text: message.text?.body ?? '',
          },
          metadata: {
            providerMessageType: message.type,
          },
        });

        if (!envelopeResult.ok) {
          return Err(envelopeResult.error);
        }

        envelopes.push(envelopeResult.value);
      }
    }
  }

  return Ok(envelopes);
}
