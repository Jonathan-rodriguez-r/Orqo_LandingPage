import { Err, Ok, type Result } from '../../shared/Result.js';
import type { IWorkspaceRepository } from '../ports/IWorkspaceRepository.js';

/**
 * Guard que verifica si un workspace puede procesar mensajes.
 * Usado por el InboundMessageWorker antes de despachar ProcessIncomingMessage.
 *
 * Si el workspace no existe en BD, se permite el paso (backwards-compat —
 * workspaces previos al Hito 5 no tienen documento en `workspaces`).
 */
export class WorkspaceGuard {
  constructor(private readonly workspaceRepo: IWorkspaceRepository) {}

  async canProcess(workspaceId: string): Promise<Result<void>> {
    const findResult = await this.workspaceRepo.findById(workspaceId);
    if (!findResult.ok) {
      // Error de BD — dejar pasar para no bloquear por problemas de infra
      return Ok(undefined);
    }

    const workspace = findResult.value;
    if (workspace === null) {
      // Workspace no registrado aún (legacy o seed pendiente) — dejar pasar
      return Ok(undefined);
    }

    if (!workspace.isOperational) {
      return Err(
        new Error(
          `Workspace ${workspaceId} no puede procesar mensajes (status: ${workspace.status})`,
        ),
      );
    }

    return Ok(undefined);
  }
}
