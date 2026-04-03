import { Ok, Err, type Result } from '../../shared/Result.js';
import type { IWorkspaceChannelConfigRepository } from '../../application/ports/IWorkspaceChannelConfigRepository.js';

/**
 * Resuelve el workspaceId ORQO a partir de los IDs de cuenta de cada canal Meta.
 */
export class WorkspaceChannelRouter {
  constructor(
    private readonly channelConfigRepo: IWorkspaceChannelConfigRepository,
  ) {}

  async resolveByPhoneNumberId(phoneNumberId: string): Promise<Result<string>> {
    const result = await this.channelConfigRepo.findByPhoneNumberId(phoneNumberId);
    if (!result.ok) return Err(result.error);
    if (!result.value) {
      return Err(new Error(`No workspace configurado para phone_number_id: ${phoneNumberId}`));
    }
    return Ok(result.value.workspaceId);
  }

  async resolveByIgAccountId(igAccountId: string): Promise<Result<string>> {
    const result = await this.channelConfigRepo.findByIgAccountId(igAccountId);
    if (!result.ok) return Err(result.error);
    if (!result.value) {
      return Err(new Error(`No workspace configurado para ig_account_id: ${igAccountId}`));
    }
    return Ok(result.value.workspaceId);
  }

  async resolveByPageId(pageId: string): Promise<Result<string>> {
    const result = await this.channelConfigRepo.findByPageId(pageId);
    if (!result.ok) return Err(result.error);
    if (!result.value) {
      return Err(new Error(`No workspace configurado para page_id: ${pageId}`));
    }
    return Ok(result.value.workspaceId);
  }
}
