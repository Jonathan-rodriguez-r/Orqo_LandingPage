import { Ok, Err, type Result } from '../../shared/Result.js';
import type { IModelRouter } from '../../application/ports/IModelRouter.js';
import type { ITenantPolicyRepository } from '../../application/ports/ITenantPolicyRepository.js';
import type { ICostTracker } from '../../application/ports/ICostTracker.js';
import type { ILlmGateway } from '../../application/ports/ILlmGateway.js';
import type { IWorkspaceProviderKeysRepository } from '../../application/ports/IWorkspaceProviderKeysRepository.js';
import {
  type ModelConfig,
  type ModelPolicy,
  DEFAULT_MODEL_POLICY,
} from '../../domain/policy/ModelPolicy.js';
import { estimateCostUsd } from '../../domain/policy/CostEstimator.js';
import { ClaudeLlmGateway } from './ClaudeLlmGateway.js';
import { OpenAILlmGateway } from './OpenAILlmGateway.js';
import { FallbackLlmGateway } from './FallbackLlmGateway.js';
import type { WorkspaceProviderKeys } from '../../domain/workspace/entities/WorkspaceProviderKeys.js';
import type { SupportedProvider } from '../../domain/workspace/value-objects/ProviderKey.js';

function toDateUtc(date: Date): string {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD
}

function toYearMonthUtc(date: Date): string {
  return date.toISOString().slice(0, 7); // YYYY-MM
}

/**
 * Implementación del router de modelos.
 *
 * - Carga la política del workspace desde MongoDB (o usa la default).
 * - Construye un FallbackLlmGateway con la cadena de proveedores configurada.
 * - Verifica presupuesto diario y mensual antes de cada llamada.
 * - Registra el uso de tokens para tracking de costos.
 * - Resuelve API keys: workspace key → env var fallback → omite proveedor.
 */
export class ModelRouter implements IModelRouter {
  constructor(
    private readonly policyRepo: ITenantPolicyRepository,
    private readonly costTracker: ICostTracker,
    private readonly providerKeysRepo: IWorkspaceProviderKeysRepository,
    private readonly encryptionKey: string,
    private readonly fallbackAnthropicKey: string,
    private readonly fallbackOpenaiKey: string,
  ) {}

  async getPolicy(workspaceId: string): Promise<ModelPolicy> {
    const stored = await this.policyRepo.findByWorkspaceId(workspaceId);
    if (stored) return stored;

    return {
      workspaceId,
      ...DEFAULT_MODEL_POLICY,
      updatedAt: new Date(),
    };
  }

  async buildGateway(workspaceId: string): Promise<Result<ILlmGateway>> {
    const policy = await this.getPolicy(workspaceId);
    const configs: ModelConfig[] = [policy.primary, ...policy.fallbacks];

    // Load workspace-specific provider keys
    let workspaceProviderKeys: WorkspaceProviderKeys | null = null;
    const keysResult = await this.providerKeysRepo.findByWorkspaceId(workspaceId);
    if (keysResult.ok) {
      workspaceProviderKeys = keysResult.value;
    }

    const gateways: ILlmGateway[] = [];
    const missingKeys: string[] = [];

    for (const config of configs) {
      const gateway = this.createGateway(config, workspaceProviderKeys, missingKeys);
      if (gateway) {
        gateways.push(gateway);
      }
    }

    if (gateways.length === 0) {
      const providers = [...new Set(missingKeys)].join(', ');
      return Err(
        new Error(
          `No hay API keys configuradas para los proveedores requeridos: ${providers}`,
        ),
      );
    }

    const gateway =
      gateways.length === 1 ? gateways[0]! : new FallbackLlmGateway(gateways);

    return Ok(gateway);
  }

  async checkBudget(workspaceId: string): Promise<Result<void>> {
    const policy = await this.getPolicy(workspaceId);
    const { dailyLimitUsd, monthlyLimitUsd } = policy.costBudget;

    const now = new Date();
    const today = toDateUtc(now);
    const thisMonth = toYearMonthUtc(now);

    const [dailyUsd, monthlyUsd] = await Promise.all([
      this.costTracker.getDailyUsageUsd(workspaceId, today),
      this.costTracker.getMonthlyUsageUsd(workspaceId, thisMonth),
    ]);

    if (dailyUsd >= dailyLimitUsd) {
      return Err(
        new Error(
          `Presupuesto diario excedido para workspace ${workspaceId}: ` +
            `$${dailyUsd.toFixed(4)} / $${dailyLimitUsd}`,
        ),
      );
    }

    if (monthlyUsd >= monthlyLimitUsd) {
      return Err(
        new Error(
          `Presupuesto mensual excedido para workspace ${workspaceId}: ` +
            `$${monthlyUsd.toFixed(4)} / $${monthlyLimitUsd}`,
        ),
      );
    }

    return Ok(undefined);
  }

  async recordUsage(
    workspaceId: string,
    model: string,
    provider: string,
    usage: { inputTokens: number; outputTokens: number },
  ): Promise<void> {
    try {
      const now = new Date();
      await this.costTracker.record({
        workspaceId,
        model,
        provider,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        estimatedCostUsd: estimateCostUsd(model, usage.inputTokens, usage.outputTokens),
        dateUtc: toDateUtc(now),
        recordedAt: now,
      });
    } catch (err) {
      // Best-effort: no detener el flujo por errores de tracking
      console.error('[ModelRouter] Error registrando uso de tokens:', err);
    }
  }

  private resolveApiKey(
    provider: SupportedProvider,
    workspaceProviderKeys: WorkspaceProviderKeys | null,
  ): string | null {
    // 1. Try workspace-specific key
    if (workspaceProviderKeys?.hasKey(provider)) {
      const providerKey = workspaceProviderKeys.getKey(provider);
      if (providerKey && this.encryptionKey) {
        try {
          return providerKey.decrypt(this.encryptionKey);
        } catch {
          // Fall through to fallback
        }
      }
    }

    // 2. Fall back to env var key
    if (provider === 'anthropic' && this.fallbackAnthropicKey) {
      return this.fallbackAnthropicKey;
    }
    if (provider === 'openai' && this.fallbackOpenaiKey) {
      return this.fallbackOpenaiKey;
    }

    return null;
  }

  private createGateway(
    config: ModelConfig,
    workspaceProviderKeys: WorkspaceProviderKeys | null,
    missingKeys: string[],
  ): ILlmGateway | null {
    if (config.provider === 'anthropic') {
      const apiKey = this.resolveApiKey('anthropic', workspaceProviderKeys);
      if (!apiKey) {
        missingKeys.push('anthropic');
        return null;
      }
      return new ClaudeLlmGateway(apiKey, config.model);
    }

    if (config.provider === 'openai') {
      const apiKey = this.resolveApiKey('openai', workspaceProviderKeys);
      if (!apiKey) {
        missingKeys.push('openai');
        return null;
      }
      return new OpenAILlmGateway(apiKey, config.model);
    }

    missingKeys.push(config.provider);
    return null;
  }
}
