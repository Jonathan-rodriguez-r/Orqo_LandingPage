import type { Result } from '../../shared/Result.js';

export interface OutboundTextMessage {
  to: string;
  body: string;
  type: 'text';
}

export interface OutboundTemplateMessage {
  to: string;
  type: 'template';
  templateName: string;
  templateParams: string[];
  languageCode?: string;
}

export type OutboundMessage = OutboundTextMessage | OutboundTemplateMessage;

export interface SendMessageResult {
  messageId: string;
  status: 'sent' | 'queued';
}

/** Puerto del canal de mensajería. Reemplazable por Telegram, Instagram, etc. */
export interface IWhatsAppGateway {
  sendMessage(message: OutboundMessage): Promise<Result<SendMessageResult>>;
  markAsRead(whatsappMessageId: string): Promise<void>;
}
