import type { Result } from '../../shared/Result.js';
import type { CanonicalChannel } from '../../domain/messaging/entities/CanonicalMessageEnvelope.js';

export interface SendMessageResult {
  messageId: string;
  status: 'sent' | 'queued';
}

/** Puerto genérico de salida para todos los canales de mensajería. */
export interface IOutboundGateway {
  sendTextMessage(to: string, body: string, workspaceId: string): Promise<Result<SendMessageResult>>;
  markAsRead?(externalMessageId: string, workspaceId: string): Promise<void>;
  canHandle(channel: CanonicalChannel): boolean;
}
