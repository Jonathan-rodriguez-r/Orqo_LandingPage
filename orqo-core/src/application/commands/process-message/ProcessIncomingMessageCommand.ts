import type { ICommand } from '../../../shared/CommandBus.js';
import type { CanonicalChannel } from '../../../domain/messaging/entities/CanonicalMessageEnvelope.js';

export interface ProcessIncomingMessageCommand extends ICommand {
  readonly _type: 'ProcessIncomingMessage';
  /** ID del workspace ORQO (tenant). */
  readonly workspaceId: string;
  /** Canal de origen del mensaje (whatsapp, instagram, facebook, widget). */
  readonly channel: CanonicalChannel;
  /** Identificador del remitente: teléfono para WA, userId numérico para IG/FB. */
  readonly senderExternalId: string;
  /** Texto del mensaje. */
  readonly body: string;
  /** ID del mensaje en la plataforma de mensajería (para dedup y ack). */
  readonly platformMessageId: string;
  readonly timestamp: Date;
}

export function createProcessIncomingMessageCommand(
  workspaceId: string,
  channel: CanonicalChannel,
  senderExternalId: string,
  body: string,
  platformMessageId: string,
  timestamp: Date = new Date(),
): ProcessIncomingMessageCommand {
  return {
    _type: 'ProcessIncomingMessage',
    workspaceId,
    channel,
    senderExternalId,
    body,
    platformMessageId,
    timestamp,
  };
}
