import { tryCatch, type Result } from '../../shared/Result.js';
import { decrypt, getEncryptionKey } from '../crypto/AesEncryption.js';
import type { IOutboundGateway, SendMessageResult } from '../../application/ports/IOutboundGateway.js';
import type { CanonicalChannel } from '../../domain/messaging/entities/CanonicalMessageEnvelope.js';
import type { IWorkspaceChannelConfigRepository } from '../../application/ports/IWorkspaceChannelConfigRepository.js';

/**
 * Gateway de salida para Facebook Messenger API.
 * Docs: https://developers.facebook.com/docs/messenger-platform/send-messages
 */
export class MetaMessengerGateway implements IOutboundGateway {
  constructor(
    private readonly channelConfigRepo: IWorkspaceChannelConfigRepository,
    private readonly apiVersion = 'v20.0',
  ) {}

  canHandle(channel: CanonicalChannel): boolean {
    return channel === 'facebook';
  }

  async sendTextMessage(to: string, body: string, workspaceId: string): Promise<Result<SendMessageResult>> {
    return tryCatch(async () => {
      const configResult = await this.channelConfigRepo.findByWorkspaceId(workspaceId);
      if (!configResult.ok) throw new Error(configResult.error.message);
      if (!configResult.value?.facebook) {
        throw new Error(`Workspace ${workspaceId} no tiene Facebook Messenger configurado`);
      }
      const { encryptedToken } = configResult.value.facebook;
      const token = decrypt(encryptedToken, getEncryptionKey());
      const apiUrl = `https://graph.facebook.com/${this.apiVersion}/me/messages`;

      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipient: { id: to },
          message: { text: body },
          messaging_type: 'RESPONSE',
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Meta Messenger API error ${res.status}: ${err}`);
      }

      const data = (await res.json()) as { message_id?: string };
      return {
        messageId: data.message_id ?? '',
        status: 'sent' as const,
      };
    });
  }
}
