import type { ModelPolicy } from '../../domain/policy/ModelPolicy.js';
import type { ILlmGateway } from './ILlmGateway.js';
import type { Result } from '../../shared/Result.js';

/**
 * Puerto del router de modelos.
 *
 * Responsabilidades:
 * - Retornar la política activa de un workspace (o la default).
 * - Construir el gateway correcto (con cadena de fallbacks) según la política.
 * - Verificar que el workspace no haya superado su presupuesto.
 * - Registrar el uso de tokens después de cada llamada.
 */
export interface IModelRouter {
  /**
   * Retorna la política del workspace.
   * Nunca falla — devuelve DEFAULT_MODEL_POLICY si no hay política configurada.
   */
  getPolicy(workspaceId: string): Promise<ModelPolicy>;

  /**
   * Construye el gateway listo para usar.
   * Si hay múltiples configs (primary + fallbacks), retorna un FallbackLlmGateway.
   * Falla con Err si ningún proveedor tiene API key configurada.
   */
  buildGateway(workspaceId: string): Promise<Result<ILlmGateway>>;

  /**
   * Verifica que el workspace no haya superado su presupuesto diario ni mensual.
   * Retorna Err con mensaje descriptivo si se supera algún límite.
   */
  checkBudget(workspaceId: string): Promise<Result<void>>;

  /**
   * Registra el uso de tokens de una llamada al LLM.
   * Best-effort — no lanza si falla la persistencia.
   */
  recordUsage(
    workspaceId: string,
    model: string,
    provider: string,
    usage: { inputTokens: number; outputTokens: number },
  ): Promise<void>;
}
