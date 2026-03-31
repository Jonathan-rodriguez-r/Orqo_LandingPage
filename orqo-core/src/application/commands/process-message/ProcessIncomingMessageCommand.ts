import type { ICommand } from '../../../shared/CommandBus.js';

export interface ProcessIncomingMessageCommand extends ICommand {
  readonly _type: 'ProcessIncomingMessage';
  /** ID del workspace ORQO (tenant). */
  readonly workspaceId: string;
  /** Número de teléfono del usuario (formato E.164 o solo dígitos). */
  readonly fromPhone: string;
  /** Texto del mensaje. */
  readonly body: string;
  /** ID del mensaje en la plataforma de mensajería (para dedup y ack). */
  readonly platformMessageId: string;
  readonly timestamp: Date;
}

export function createProcessIncomingMessageCommand(
  workspaceId: string,
  fromPhone: string,
  body: string,
  platformMessageId: string,
  timestamp: Date = new Date(),
): ProcessIncomingMessageCommand {
  return {
    _type: 'ProcessIncomingMessage',
    workspaceId,
    fromPhone,
    body,
    platformMessageId,
    timestamp,
  };
}
