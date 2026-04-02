import { ModelRouter } from '../ModelRouter.js';
import { Ok } from '../../../shared/Result.js';
import type { ITenantPolicyRepository } from '../../../application/ports/ITenantPolicyRepository.js';
import type { ICostTracker } from '../../../application/ports/ICostTracker.js';
import type { ModelPolicy } from '../../../domain/policy/ModelPolicy.js';
import { DEFAULT_MODEL_POLICY } from '../../../domain/policy/ModelPolicy.js';

function makePolicyRepo(policy: ModelPolicy | null = null): ITenantPolicyRepository {
  return {
    findByWorkspaceId: jest.fn().mockResolvedValue(policy),
    save: jest.fn().mockResolvedValue(undefined),
  };
}

function makeCostTracker(dailyUsd = 0, monthlyUsd = 0): ICostTracker {
  return {
    record: jest.fn().mockResolvedValue(undefined),
    getDailyUsageUsd: jest.fn().mockResolvedValue(dailyUsd),
    getMonthlyUsageUsd: jest.fn().mockResolvedValue(monthlyUsd),
  };
}

const FAKE_ANTHROPIC_KEY = 'sk-ant-test-key';
const FAKE_OPENAI_KEY = 'sk-openai-test-key';

describe('ModelRouter.getPolicy', () => {
  it('retorna la política del workspace si existe', async () => {
    const customPolicy: ModelPolicy = {
      workspaceId: 'ws-1',
      primary: { provider: 'openai', model: 'gpt-4o' },
      fallbacks: [],
      costBudget: { dailyLimitUsd: 5, monthlyLimitUsd: 50 },
      guardrails: { maxToolCallsPerTurn: 2, toolTimeoutMs: 5_000, maxInputTokens: 4_096 },
      updatedAt: new Date(),
    };

    const router = new ModelRouter(makePolicyRepo(customPolicy), makeCostTracker(), FAKE_ANTHROPIC_KEY, FAKE_OPENAI_KEY);
    const policy = await router.getPolicy('ws-1');

    expect(policy.primary.model).toBe('gpt-4o');
    expect(policy.costBudget.dailyLimitUsd).toBe(5);
  });

  it('retorna la política default si el workspace no tiene configuración', async () => {
    const router = new ModelRouter(makePolicyRepo(null), makeCostTracker(), FAKE_ANTHROPIC_KEY, FAKE_OPENAI_KEY);
    const policy = await router.getPolicy('ws-nueva');

    expect(policy.primary.model).toBe(DEFAULT_MODEL_POLICY.primary.model);
    expect(policy.workspaceId).toBe('ws-nueva');
  });
});

describe('ModelRouter.buildGateway', () => {
  it('retorna Ok con gateway anthropic si hay API key', async () => {
    const router = new ModelRouter(makePolicyRepo(null), makeCostTracker(), FAKE_ANTHROPIC_KEY, '');
    const result = await router.buildGateway('ws-1');

    expect(result.ok).toBe(true);
  });

  it('retorna Ok con FallbackGateway cuando hay primary + fallback', async () => {
    const policy: ModelPolicy = {
      workspaceId: 'ws-1',
      primary: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
      fallbacks: [{ provider: 'openai', model: 'gpt-4o' }],
      costBudget: { dailyLimitUsd: 10, monthlyLimitUsd: 100 },
      guardrails: { maxToolCallsPerTurn: 3, toolTimeoutMs: 10_000, maxInputTokens: 8_192 },
      updatedAt: new Date(),
    };
    const router = new ModelRouter(makePolicyRepo(policy), makeCostTracker(), FAKE_ANTHROPIC_KEY, FAKE_OPENAI_KEY);
    const result = await router.buildGateway('ws-1');

    expect(result.ok).toBe(true);
  });

  it('retorna Err si no hay API keys para ningún proveedor', async () => {
    const router = new ModelRouter(makePolicyRepo(null), makeCostTracker(), '', '');
    const result = await router.buildGateway('ws-1');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('API keys');
    }
  });
});

describe('ModelRouter.checkBudget', () => {
  it('retorna Ok si no se supera ningún límite', async () => {
    const router = new ModelRouter(makePolicyRepo(null), makeCostTracker(1, 5), FAKE_ANTHROPIC_KEY, '');
    const result = await router.checkBudget('ws-1');
    expect(result.ok).toBe(true);
  });

  it('retorna Err si se supera el límite diario', async () => {
    // Default dailyLimitUsd = 10, uso = 10 → excedido
    const router = new ModelRouter(makePolicyRepo(null), makeCostTracker(10, 10), FAKE_ANTHROPIC_KEY, '');
    const result = await router.checkBudget('ws-1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('diario');
    }
  });

  it('retorna Err si se supera el límite mensual', async () => {
    // Default monthlyLimitUsd = 100, uso = 100 → excedido
    const router = new ModelRouter(makePolicyRepo(null), makeCostTracker(0, 100), FAKE_ANTHROPIC_KEY, '');
    const result = await router.checkBudget('ws-1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('mensual');
    }
  });
});

describe('ModelRouter.recordUsage', () => {
  it('registra el uso correctamente', async () => {
    const tracker = makeCostTracker();
    const router = new ModelRouter(makePolicyRepo(null), tracker, FAKE_ANTHROPIC_KEY, '');

    await router.recordUsage('ws-1', 'claude-sonnet-4-6', 'anthropic', { inputTokens: 100, outputTokens: 50 });

    expect(tracker.record).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        model: 'claude-sonnet-4-6',
        provider: 'anthropic',
        inputTokens: 100,
        outputTokens: 50,
        estimatedCostUsd: expect.any(Number),
      }),
    );
  });

  it('no lanza si el tracker falla (best-effort)', async () => {
    const tracker = makeCostTracker();
    (tracker.record as jest.Mock).mockRejectedValue(new Error('MongoDB down'));

    const router = new ModelRouter(makePolicyRepo(null), tracker, FAKE_ANTHROPIC_KEY, '');

    await expect(
      router.recordUsage('ws-1', 'claude-sonnet-4-6', 'anthropic', { inputTokens: 10, outputTokens: 5 }),
    ).resolves.not.toThrow();
  });
});
