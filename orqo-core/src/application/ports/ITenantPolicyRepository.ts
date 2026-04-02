import type { ModelPolicy } from '../../domain/policy/ModelPolicy.js';

/**
 * Puerto para leer y persistir políticas de modelos por workspace.
 */
export interface ITenantPolicyRepository {
  /** Retorna null si el workspace no tiene política configurada (se usa la default). */
  findByWorkspaceId(workspaceId: string): Promise<ModelPolicy | null>;
  /** Upsert — crea o actualiza la política. */
  save(policy: ModelPolicy): Promise<void>;
}
