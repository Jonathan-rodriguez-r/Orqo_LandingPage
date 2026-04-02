/**
 * Estimación de costo en USD por modelo y tokens consumidos.
 * Precios en USD por millón de tokens (input / output).
 *
 * Fuente: precios publicados por cada proveedor — actualizar cuando cambien.
 */

interface ModelPricing {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
}

const PRICING: Record<string, ModelPricing> = {
  // Anthropic
  'claude-opus-4-6':            { inputUsdPerMillion: 15.00, outputUsdPerMillion: 75.00 },
  'claude-sonnet-4-6':          { inputUsdPerMillion:  3.00, outputUsdPerMillion: 15.00 },
  'claude-haiku-4-5-20251001':  { inputUsdPerMillion:  0.25, outputUsdPerMillion:  1.25 },
  // OpenAI
  'gpt-4o':                     { inputUsdPerMillion:  2.50, outputUsdPerMillion: 10.00 },
  'gpt-4o-mini':                { inputUsdPerMillion:  0.15, outputUsdPerMillion:  0.60 },
};

/** Precio conservador usado cuando el modelo no está en la tabla. */
const FALLBACK_PRICING: ModelPricing = {
  inputUsdPerMillion: 3.00,
  outputUsdPerMillion: 15.00,
};

/**
 * Estima el costo en USD de una llamada al LLM.
 * Retorna 0 si los tokens son 0 o negativos.
 */
export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  if (inputTokens <= 0 && outputTokens <= 0) return 0;

  const pricing = PRICING[model] ?? FALLBACK_PRICING;
  const inputCost = (inputTokens / 1_000_000) * pricing.inputUsdPerMillion;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputUsdPerMillion;

  return inputCost + outputCost;
}

/** Retorna true si el modelo tiene precio conocido en la tabla. */
export function isKnownModel(model: string): boolean {
  return model in PRICING;
}
