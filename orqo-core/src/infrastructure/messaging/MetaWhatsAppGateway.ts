import { tryCatch, type Result } from '../../shared/Result.js';
import { decrypt, getEncryptionKey } from '../crypto/AesEncryption.js';
import type { IOutboundGateway, SendMessageResult } from '../../application/ports/IOutboundGateway.js';
import type { CanonicalChannel } from '../../domain/messaging/entities/CanonicalMessageEnvelope.js';
import type { IWorkspaceChannelConfigRepository } from '../../application/ports/IWorkspaceChannelConfigRepository.js';

/**
 * Implementación del WhatsApp Gateway usando la API oficial de Meta.
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/messages
 * Las credenciales se resuelven por workspace desde WorkspaceChannelConfig.
 */
export class MetaWhatsAppGateway implements IOutboundGateway {
  constructor(
    private readonly channelConfigRepo: IWorkspaceChannelConfigRepository,
    private readonly apiVersion = 'v20.0',
  ) {}

  canHandle(channel: CanonicalChannel): boolean {
    return channel === 'whatsapp';
  }

  async sendTextMessage(to: string, body: string, workspaceId: string): Promise<Result<SendMessageResult>> {
    return tryCatch(async () => {
      const configResult = await this.channelConfigRepo.findByWorkspaceId(workspaceId);
      if (!configResult.ok) throw new Error(configResult.error.message);
      if (!configResult.value?.whatsapp) {
        throw new Error(`Workspace ${workspaceId} no tiene WhatsApp configurado`);
      }
      const { phoneNumberId, encryptedToken } = configResult.value.whatsapp;
      const token = decrypt(encryptedToken, getEncryptionKey());
      const apiUrl = `https://graph.facebook.com/${this.apiVersion}/${phoneNumberId}/messages`;

      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body, preview_url: false },
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Meta WhatsApp API error ${res.status}: ${err}`);
      }

      const data = (await res.json()) as { messages: Array<{ id: string }> };
      return {
        messageId: data.messages[0]?.id ?? '',
        status: 'sent' as const,
      };
    });
  }

  async markAsRead(externalMessageId: string, workspaceId: string): Promise<void> {
    const configResult = await this.channelConfigRepo.findByWorkspaceId(workspaceId);
    if (!configResult.ok || !configResult.value?.whatsapp) return;

    const { phoneNumberId, encryptedToken } = configResult.value.whatsapp;
    const token = decrypt(encryptedToken, getEncryptionKey());
    const apiUrl = `https://graph.facebook.com/${this.apiVersion}/${phoneNumberId}/messages`;

    await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: externalMessageId,
      }),
    }).catch(() => { /* best-effort */ });
  }
}
