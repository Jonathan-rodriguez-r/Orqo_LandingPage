import { CanonicalMessageEnvelope } from '../../domain/messaging/entities/CanonicalMessageEnvelope.js';
import type { OutboundMessageStatusUpdate } from '../../application/ports/IOutboundMessageOutbox.js';
import { Err, Ok, type Result } from '../../shared/Result.js';
import type { WorkspaceChannelRouter } from './WorkspaceChannelRouter.js';

interface WhatsAppStatusError {
  code?: number | string;
  title?: string;
  message?: string;
  error_data?: { details?: string };
  [key: string]: unknown;
}

interface WhatsAppWebhookStatus {
  id?: string;
  recipient_id?: string;
  status?: string;
  timestamp?: string;
  conversation?: Record<string, unknown>;
  pricing?: Record<string, unknown>;
  errors?: WhatsAppStatusError[];
  biz_opaque_callback_data?: string;
}

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
        statuses?: WhatsAppWebhookStatus[];
        metadata?: { phone_number_id?: string };
      };
    }>;
  }>;
}

const WHATSAPP_DELIVERY_STATUSES = new Set<OutboundMessageStatusUpdate['status']>([
  'sent',
  'delivered',
  'read',
  'failed',
  'deleted',
]);

function isWhatsAppDeliveryStatus(status: string | undefined): status is OutboundMessageStatusUpdate['status'] {
  return WHATSAPP_DELIVERY_STATUSES.has(status as OutboundMessageStatusUpdate['status']);
}

function parseMetaTimestamp(timestamp: string | undefined): Date {
  const seconds = Number(timestamp);
  return Number.isFinite(seconds) && seconds > 0
    ? new Date(seconds * 1000)
    : new Date();
}

function formatFailureReason(errors: WhatsAppStatusError[] | undefined): string | undefined {
  if (!errors?.length) return undefined;

  return errors
    .map(error => {
      const parts = [
        error.code !== undefined ? `code ${error.code}` : undefined,
        error.title,
        error.message,
        error.error_data?.details,
      ].filter((part): part is string => Boolean(part));

      return parts.join(': ');
    })
    .filter(Boolean)
    .join('; ');
}

function buildStatusMetadata(status: WhatsAppWebhookStatus): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};

  if (status.conversation !== undefined) metadata['conversation'] = status.conversation;
  if (status.pricing !== undefined) metadata['pricing'] = status.pricing;
  if (status.errors !== undefined) metadata['errors'] = status.errors;
  if (status.biz_opaque_callback_data !== undefined) {
    metadata['bizOpaqueCallbackData'] = status.biz_opaque_callback_data;
  }

  return metadata;
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
        // Algunos eventos de sistema de Meta (account updates, templates, etc.)
        // no traen phone_number_id — se omiten sin fallar el payload completo.
        continue;
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
          occurredAt: parseMetaTimestamp(message.timestamp),
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

export async function normalizeWhatsAppStatusUpdates(
  payload: WhatsAppWebhookPayload,
  router: WorkspaceChannelRouter,
): Promise<Result<OutboundMessageStatusUpdate[]>> {
  const updates: OutboundMessageStatusUpdate[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const statuses = change.value?.statuses ?? [];
      if (!statuses.length) continue;

      const phoneNumberId = change.value?.metadata?.phone_number_id?.trim();
      if (!phoneNumberId) {
        return Err(new Error('El webhook de WhatsApp no trae phone_number_id para estados'));
      }

      const workspaceResult = await router.resolveByPhoneNumberId(phoneNumberId);
      if (!workspaceResult.ok) return Err(workspaceResult.error);

      for (const status of statuses) {
        const providerMessageId = status.id?.trim();
        if (!providerMessageId || !isWhatsAppDeliveryStatus(status.status)) {
          continue;
        }

        const metadata = buildStatusMetadata(status);
        const failureReason = formatFailureReason(status.errors);
        updates.push({
          workspaceId: workspaceResult.value,
          providerMessageId,
          providerAccountId: phoneNumberId,
          status: status.status,
          occurredAt: parseMetaTimestamp(status.timestamp),
          ...(status.recipient_id !== undefined ? { recipient: status.recipient_id } : {}),
          ...(failureReason !== undefined ? { failureReason } : {}),
          ...(Object.keys(metadata).length ? { metadata } : {}),
        });
      }
    }
  }

  return Ok(updates);
}
