import { estimateCostUsd, isKnownModel } from '../CostEstimator.js';

describe('estimateCostUsd', () => {
  it('devuelve 0 si tokens son 0', () => {
    expect(estimateCostUsd('claude-sonnet-4-6', 0, 0)).toBe(0);
  });

  it('calcula costo de Claude Sonnet 4.6', () => {
    // 1M input @ $3 + 0 output = $3
    const cost = estimateCostUsd('claude-sonnet-4-6', 1_000_000, 0);
    expect(cost).toBeCloseTo(3.0);
  });

  it('calcula costo de Claude Haiku 4.5', () => {
    // 0 input + 1M output @ $1.25 = $1.25
    const cost = estimateCostUsd('claude-haiku-4-5-20251001', 0, 1_000_000);
    expect(cost).toBeCloseTo(1.25);
  });

  it('calcula costo de GPT-4o', () => {
    // 500k input @ $2.50 + 200k output @ $10 = $1.25 + $2 = $3.25
    const cost = estimateCostUsd('gpt-4o', 500_000, 200_000);
    expect(cost).toBeCloseTo(3.25);
  });

  it('calcula costo de GPT-4o-mini', () => {
    const cost = estimateCostUsd('gpt-4o-mini', 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(0.15 + 0.60);
  });

  it('usa precio conservador para modelos desconocidos', () => {
    // Fallback: $3/M input, $15/M output
    const cost = estimateCostUsd('modelo-desconocido-xyz', 1_000_000, 0);
    expect(cost).toBeCloseTo(3.0);
  });

  it('suma input y output correctamente', () => {
    // claude-opus-4-6: $15 input + $75 output
    const cost = estimateCostUsd('claude-opus-4-6', 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(90.0);
  });
});

describe('isKnownModel', () => {
  it('retorna true para modelos conocidos', () => {
    expect(isKnownModel('claude-sonnet-4-6')).toBe(true);
    expect(isKnownModel('gpt-4o')).toBe(true);
    expect(isKnownModel('gpt-4o-mini')).toBe(true);
  });

  it('retorna false para modelos desconocidos', () => {
    expect(isKnownModel('llama-3')).toBe(false);
    expect(isKnownModel('')).toBe(false);
  });
});
