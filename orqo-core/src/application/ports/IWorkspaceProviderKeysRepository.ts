import type { Result } from '../../shared/Result.js';
import type { WorkspaceProviderKeys } from '../../domain/workspace/entities/WorkspaceProviderKeys.js';

/**
 * Puerto para persistencia de las API keys cifradas de proveedores LLM por workspace.
 */
export interface IWorkspaceProviderKeysRepository {
  findByWorkspaceId(workspaceId: string): Promise<Result<WorkspaceProviderKeys | null>>;
  save(keys: WorkspaceProviderKeys): Promise<Result<void>>;
}
