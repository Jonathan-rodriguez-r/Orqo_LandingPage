import { CanonicalMessageEnvelope } from '../../domain/messaging/entities/CanonicalMessageEnvelope.js';
import { Err, Ok, type Result } from '../../shared/Result.js';
import type { WorkspaceChannelRouter } from './WorkspaceChannelRouter.js';

export interface MessengerWebhookPayload {
  object?: string;
  entry?: Array<{
    id?: string; // page id
    messaging?: Array<{
      sender?: { id?: string };
      recipient?: { id?: string };
      timestamp?: number;
      message?: { mid?: string; text?: string };
    }>;
  }>;
}

export async function normalizeMessengerWebhook(
  payload: MessengerWebhookPayload,
  router: WorkspaceChannelRouter,
): Promise<Result<CanonicalMessageEnvelope[]>> {
  const envelopes: CanonicalMessageEnvelope[] = [];

  for (const entry of payload.entry ?? []) {
    const pageId = entry.id?.trim();
    if (!pageId) {
      return Err(new Error('El webhook de Messenger no trae entry.id (page_id)'));
    }

    const workspaceResult = await router.resolveByPageId(pageId);
    if (!workspaceResult.ok) return Err(workspaceResult.error);
    const workspaceId = workspaceResult.value;

    for (const msg of entry.messaging ?? []) {
      const mid = msg.message?.mid?.trim();
      const text = msg.message?.text?.trim();
      const senderId = msg.sender?.id?.trim();

      if (!mid || !text || !senderId) {
        continue;
      }

      const occurredAt = msg.timestamp
        ? new Date(msg.timestamp)
        : new Date();

      const envelopeResult = CanonicalMessageEnvelope.create({
        workspaceId,
        channel: 'facebook',
        provider: 'meta',
        providerAccountId: pageId,
        externalMessageId: mid,
        senderExternalId: senderId,
        occurredAt,
        payload: { type: 'text', text },
        metadata: { pageId },
      });

      if (!envelopeResult.ok) {
        return Err(envelopeResult.error);
      }

      envelopes.push(envelopeResult.value);
    }
  }

  return Ok(envelopes);
}
