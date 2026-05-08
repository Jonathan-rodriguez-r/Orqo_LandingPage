import type { CanonicalChannel } from '../../domain/messaging/entities/CanonicalMessageEnvelope.js';

export type OutboundMessageStatus =
  | 'pending'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed'
  | 'deleted';

export interface PendingOutboundMessage {
  readonly workspaceId: string;
  readonly conversationId: string;
  readonly channel: CanonicalChannel;
  readonly recipient: string;
  readonly body: string;
  readonly correlationId: string;
}

export interface OutboundMessageStatusUpdate {
  readonly workspaceId: string;
  readonly providerMessageId: string;
  readonly status: Exclude<OutboundMessageStatus, 'pending'>;
  readonly occurredAt: Date;
  readonly providerAccountId?: string;
  readonly recipient?: string;
  readonly failureReason?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface IOutboundMessageOutbox {
  createPending(message: PendingOutboundMessage): Promise<string>;
  markSent(outboxId: string, providerMessageId: string): Promise<void>;
  markFailed(outboxId: string, reason: string): Promise<void>;
  markProviderStatus(update: OutboundMessageStatusUpdate): Promise<boolean>;
}
