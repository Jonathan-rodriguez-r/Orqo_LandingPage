import type { CanonicalChannel } from '../../domain/messaging/entities/CanonicalMessageEnvelope.js';

export interface PendingOutboundMessage {
  readonly workspaceId: string;
  readonly conversationId: string;
  readonly channel: CanonicalChannel;
  readonly recipient: string;
  readonly body: string;
  readonly correlationId: string;
}

export interface IOutboundMessageOutbox {
  createPending(message: PendingOutboundMessage): Promise<string>;
  markSent(outboxId: string, providerMessageId: string): Promise<void>;
  markFailed(outboxId: string, reason: string): Promise<void>;
}
