import { CanonicalMessageEnvelope } from '../../domain/messaging/entities/CanonicalMessageEnvelope.js';
import { Err, Ok, type Result } from '../../shared/Result.js';
import type { WorkspaceChannelRouter } from './WorkspaceChannelRouter.js';

export interface InstagramWebhookPayload {
  object?: string;
  entry?: Array<{
    id?: string; // ig account id
    messaging?: Array<{
      sender?: { id?: string };
      recipient?: { id?: string };
      timestamp?: number;
      message?: { mid?: string; text?: string };
    }>;
  }>;
}

export async function normalizeInstagramWebhook(
  payload: InstagramWebhookPayload,
  router: WorkspaceChannelRouter,
): Promise<Result<CanonicalMessageEnvelope[]>> {
  const envelopes: CanonicalMessageEnvelope[] = [];

  for (const entry of payload.entry ?? []) {
    const igAccountId = entry.id?.trim();
    if (!igAccountId) {
      return Err(new Error('El webhook de Instagram no trae entry.id (ig_account_id)'));
    }

    const workspaceResult = await router.resolveByIgAccountId(igAccountId);
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
        channel: 'instagram',
        provider: 'meta',
        providerAccountId: igAccountId,
        externalMessageId: mid,
        senderExternalId: senderId,
        occurredAt,
        payload: { type: 'text', text },
        metadata: { igAccountId },
      });

      if (!envelopeResult.ok) {
        return Err(envelopeResult.error);
      }

      envelopes.push(envelopeResult.value);
    }
  }

  return Ok(envelopes);
}
