import type { Result } from '../../shared/Result.js';
import type { SkillManifest } from './SkillManifest.js';

/**
 * Contexto que recibe cada Skill al ejecutarse.
 * Contiene todo lo necesario para operar sin acoplarse al resto del sistema.
 */
export interface SkillContext {
  conversationId: string;
  workspaceId: string;
  /** Último mensaje del usuario (texto plano). */
  message: string;
  /** Historial reciente para contexto multi-turno. */
  history: ReadonlyArray<{ role: 'user' | 'assistant'; content: string }>;
  /** Parámetros extraídos por el LLM al invocar la tool (del inputSchema). */
  toolInput: Record<string, unknown>;
}

export interface SkillResult {
  /** Texto que se incluirá en la síntesis final del LLM. */
  content: string;
  /** Artefactos opcionales (listas, imágenes, metadata) para post-procesado. */
  artifacts?: unknown[];
  metadata?: Record<string, unknown>;
}

/**
 * ISkill — THE contrato central del sistema.
 *
 * Principio de Inversión de Dependencias:
 *   - Application Layer depende de ISkill (abstracción)
 *   - Las implementaciones concretas (WooCommerce, Reservas, etc.) están en Infrastructure
 *
 * Principio Open/Closed:
 *   - Core nunca cambia al agregar una Skill
 *   - Solo se registra la nueva implementación en Container.ts
 */
export interface ISkill {
  readonly manifest: SkillManifest;

  /**
   * Pre-filtro rápido sin llamar al LLM.
   * Debe ser O(1) — sin I/O. Usa keywords / regex del manifest.
   */
  canHandle(context: SkillContext): boolean;

  /**
   * Lógica de ejecución directa (para Skills "puras" sin MCP).
   * Las Skills respaldadas por MCP normalmente no necesitan implementar
   * lógica aquí — la Orchestration Service las delega al McpGateway.
   */
  execute(context: SkillContext): Promise<Result<SkillResult>>;
}
