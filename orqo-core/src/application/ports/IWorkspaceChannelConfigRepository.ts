import type { Result } from '../../shared/Result.js';
import type { WorkspaceChannelConfig } from '../../domain/workspace/entities/WorkspaceChannelConfig.js';

export interface IWorkspaceChannelConfigRepository {
  findByWorkspaceId(workspaceId: string): Promise<Result<WorkspaceChannelConfig | null>>;
  findByPhoneNumberId(phoneNumberId: string): Promise<Result<WorkspaceChannelConfig | null>>;
  findByIgAccountId(igAccountId: string): Promise<Result<WorkspaceChannelConfig | null>>;
  findByPageId(pageId: string): Promise<Result<WorkspaceChannelConfig | null>>;
  save(config: WorkspaceChannelConfig): Promise<Result<void>>;
}
