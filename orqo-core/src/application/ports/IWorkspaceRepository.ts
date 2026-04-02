import type { Result } from '../../shared/Result.js';
import type { Workspace } from '../../domain/workspace/entities/Workspace.js';

export interface IWorkspaceRepository {
  /** Busca por ID de workspace. */
  findById(workspaceId: string): Promise<Result<Workspace | null>>;

  /** Busca verificando el hash de la API key contra la lista de workspaces. */
  findByApiKeyHash(hash: string): Promise<Result<Workspace | null>>;

  /** Persiste un workspace (insert o upsert por id). */
  save(workspace: Workspace): Promise<Result<void>>;

  /** Lista todos los workspaces. */
  list(filter?: { status?: string }): Promise<Result<Workspace[]>>;
}
