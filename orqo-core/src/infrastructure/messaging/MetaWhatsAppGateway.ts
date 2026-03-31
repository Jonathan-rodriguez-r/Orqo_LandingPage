import { Ok, Err, tryCatch, type Result } from '../../shared/Result.js';
import type {
  IWhatsAppGateway,
  OutboundMessage,
  SendMessageResult,
} from '../../application/ports/IWhatsAppGateway.js';

/**
 * Implementación del WhatsApp Gateway usando la API oficial de Meta.
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/messages
 */
export class MetaWhatsAppGateway implements IWhatsAppGateway {
  private readonly apiUrl: string;
  private readonly token: string;
  private readonly phoneNumberId: string;

  constructor(
    token = process.env['WHATSAPP_TOKEN'] ?? '',
    phoneNumberId = process.env['WHATSAPP_PHONE_ID'] ?? '',
    apiVersion = 'v20.0',
  ) {
    this.token = token;
    this.phoneNumberId = phoneNumberId;
    this.apiUrl = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
  }

  async sendMessage(message: OutboundMessage): Promise<Result<SendMessageResult>> {
    return tryCatch(async () => {
      const body =
        message.type === 'template'
          ? {
              messaging_product: 'whatsapp',
              to: message.to,
              type: 'template',
              template: {
                name: message.templateName,
                language: { code: message.languageCode ?? 'es' },
                components: message.templateParams.map((p, i) => ({
                  type: 'body',
                  parameters: [{ type: 'text', text: p }],
                })),
              },
            }
          : {
              messaging_product: 'whatsapp',
              to: message.to,
              type: 'text',
              text: { body: message.body, preview_url: false },
            };

      const res = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Meta API error ${res.status}: ${err}`);
      }

      const data = (await res.json()) as { messages: Array<{ id: string }> };
      return {
        messageId: data.messages[0]?.id ?? '',
        status: 'sent' as const,
      };
    });
  }

  async markAsRead(whatsappMessageId: string): Promise<void> {
    await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: whatsappMessageId,
      }),
    }).catch(() => { /* best-effort */ });
  }
}
