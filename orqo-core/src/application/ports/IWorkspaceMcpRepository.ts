import type { Result } from '../../shared/Result.js';
import type { WorkspaceMcpServer } from '../../domain/workspace/entities/WorkspaceMcpServer.js';

export interface IWorkspaceMcpRepository {
  findById(id: string): Promise<Result<WorkspaceMcpServer | null>>;
  findByWorkspace(workspaceId: string): Promise<Result<WorkspaceMcpServer[]>>;
  save(server: WorkspaceMcpServer): Promise<Result<void>>;
  delete(id: string): Promise<Result<void>>;
}
