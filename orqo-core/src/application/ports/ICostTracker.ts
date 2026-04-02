/**
 * Puerto para registrar y consultar el consumo de tokens / costo por workspace.
 */

export interface TokenUsageRecord {
  workspaceId: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  /** Costo estimado en USD para esta llamada. */
  estimatedCostUsd: number;
  /** Fecha UTC en formato YYYY-MM-DD. Usada para agrupar por día y mes. */
  dateUtc: string;
  recordedAt: Date;
}

export interface ICostTracker {
  /** Registra el uso de tokens de una llamada al LLM. */
  record(usage: TokenUsageRecord): Promise<void>;
  /** Suma el costo estimado en USD para el workspace en la fecha dada (YYYY-MM-DD). */
  getDailyUsageUsd(workspaceId: string, dateUtc: string): Promise<number>;
  /** Suma el costo estimado en USD para el workspace en el mes dado (YYYY-MM). */
  getMonthlyUsageUsd(workspaceId: string, yearMonthUtc: string): Promise<number>;
}
