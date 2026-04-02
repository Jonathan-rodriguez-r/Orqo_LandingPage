/**
 * Domain types para políticas de modelos por tenant.
 * Sin dependencias externas — pura lógica de negocio.
 */

export type SupportedProvider = 'anthropic' | 'openai';

/** Configuración de un modelo específico. */
export interface ModelConfig {
  provider: SupportedProvider;
  /** ID del modelo en el proveedor (e.g. 'claude-sonnet-4-6', 'gpt-4o'). */
  model: string;
  /** Override de max_tokens para este modelo. */
  maxTokens?: number;
}

/** Guardrails para tool calling por turno. */
export interface GuardrailPolicy {
  /** Máximo de tool calls que el LLM puede invocar por turno. Default: 3. */
  maxToolCallsPerTurn: number;
  /** Timeout por ejecución de cada tool en ms. Default: 10_000. */
  toolTimeoutMs: number;
  /** Máximo de tokens de entrada permitidos por llamada. Default: 8_192. */
  maxInputTokens: number;
}

/** Límites de gasto por workspace. */
export interface CostBudget {
  /** Límite diario en USD. Se resetea a medianoche UTC. */
  dailyLimitUsd: number;
  /** Límite mensual en USD. Se resetea el primer día del mes UTC. */
  monthlyLimitUsd: number;
}

/**
 * Política completa de un workspace.
 * Define qué modelo usar, fallbacks, presupuesto y guardrails.
 */
export interface ModelPolicy {
  workspaceId: string;
  /** Modelo principal a usar. */
  primary: ModelConfig;
  /** Lista de fallbacks, en orden de prioridad. */
  fallbacks: ModelConfig[];
  costBudget: CostBudget;
  guardrails: GuardrailPolicy;
  updatedAt: Date;
}

/** Política por defecto aplicada cuando un workspace no tiene configuración propia. */
export const DEFAULT_MODEL_POLICY = {
  primary: {
    provider: 'anthropic' as SupportedProvider,
    model: 'claude-sonnet-4-6',
    maxTokens: 1_024,
  },
  fallbacks: [
    {
      provider: 'anthropic' as SupportedProvider,
      model: 'claude-haiku-4-5-20251001',
      maxTokens: 1_024,
    },
  ],
  costBudget: {
    dailyLimitUsd: 10,
    monthlyLimitUsd: 100,
  },
  guardrails: {
    maxToolCallsPerTurn: 3,
    toolTimeoutMs: 10_000,
    maxInputTokens: 8_192,
  },
} as const satisfies Omit<ModelPolicy, 'workspaceId' | 'updatedAt'>;
