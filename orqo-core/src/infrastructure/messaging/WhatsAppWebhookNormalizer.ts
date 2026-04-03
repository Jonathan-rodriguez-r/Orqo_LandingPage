import { CanonicalMessageEnvelope } from '../../domain/messaging/entities/CanonicalMessageEnvelope.js';
import { Err, Ok, type Result } from '../../shared/Result.js';
import type { WorkspaceChannelRouter } from './WorkspaceChannelRouter.js';

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

export async function normalizeWhatsAppWebhook(
  payload: WhatsAppWebhookPayload,
  router: WorkspaceChannelRouter,
): Promise<Result<CanonicalMessageEnvelope[]>> {
  const envelopes: CanonicalMessageEnvelope[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const phoneNumberId = change.value?.metadata?.phone_number_id?.trim();
      if (!phoneNumberId) {
        return Err(new Error('El webhook de WhatsApp no trae phone_number_id'));
      }

      const workspaceResult = await router.resolveByPhoneNumberId(phoneNumberId);
      if (!workspaceResult.ok) return Err(workspaceResult.error);
      const workspaceId = workspaceResult.value;

      for (const message of change.value?.messages ?? []) {
        if (message.type !== 'text') {
          continue;
        }

        const envelopeResult = CanonicalMessageEnvelope.create({
          workspaceId,
          channel: 'whatsapp',
          provider: 'meta',
          providerAccountId: phoneNumberId,
          externalMessageId: message.id ?? '',
          senderExternalId: message.from ?? '',
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
