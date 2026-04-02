import { randomUUID } from 'node:crypto';
import { Err, type Result } from '../../../shared/Result.js';
import { Workspace } from '../../../domain/workspace/entities/Workspace.js';
import { Agent } from '../../../domain/agent/entities/Agent.js';
import type { IWorkspaceRepository } from '../../ports/IWorkspaceRepository.js';
import type { IAgentRepository } from '../../ports/IAgentRepository.js';
import type { ITenantPolicyRepository } from '../../ports/ITenantPolicyRepository.js';
import { DEFAULT_MODEL_POLICY } from '../../../domain/policy/ModelPolicy.js';
import type { ProvisionWorkspaceCommand } from './ProvisionWorkspaceCommand.js';

export interface ProvisionWorkspaceResult {
  workspaceId: string;
  apiKeyPlaintext: string;
  agentId: string;
}

/**
 * Provisiona un workspace nuevo de forma transaccional (best-effort):
 * 1. Crea el Workspace con API key
 * 2. Crea un agente por defecto
 * 3. Crea la política de modelos por defecto
 *
 * Si falla el agente o la política, el workspace ya quedó guardado — el operador
 * puede volver a correr el seed script para completar el setup.
 */
export class ProvisionWorkspaceHandler {
  constructor(
    private readonly workspaceRepo: IWorkspaceRepository,
    private readonly agentRepo: IAgentRepository,
    private readonly policyRepo: ITenantPolicyRepository,
  ) {}

  async handle(command: ProvisionWorkspaceCommand): Promise<Result<ProvisionWorkspaceResult>> {
    // 1. Crear workspace
    const provisionResult = Workspace.provision({
      name: command.name,
      ...(command.agentName !== undefined ? { agentName: command.agentName } : {}),
      ...(command.plan !== undefined ? { plan: command.plan } : {}),
      ...(command.timezone !== undefined ? { timezone: command.timezone } : {}),
      ...(command.trialDays !== undefined ? { trialDays: command.trialDays } : {}),
    });
    if (!provisionResult.ok) return Err(provisionResult.error);

    const { workspace, apiKeyPlaintext } = provisionResult.value;

    const saveResult = await this.workspaceRepo.save(workspace);
    if (!saveResult.ok) return Err(saveResult.error);

    // 2. Crear agente por defecto
    const agentId = randomUUID();
    const agentName = workspace.branding.agentName;
    const agent = new Agent(
      agentId,
      workspace.id,
      agentName,
      `Eres ${agentName}, el asistente virtual de ${workspace.name}. ` +
        `Responde siempre en español, de forma amable y concisa. ` +
        `Ayuda a los clientes con sus consultas y pedidos.`,
      ['support-faq', 'woocommerce-orders'],
      20,
      true,
    );

    // Best-effort: si falla el agente, el workspace ya existe
    await this.agentRepo.save(agent);

    // 3. Crear política de modelos por defecto
    await this.policyRepo.save({
      workspaceId: workspace.id,
      ...DEFAULT_MODEL_POLICY,
      updatedAt: new Date(),
    });

    return { ok: true, value: { workspaceId: workspace.id, apiKeyPlaintext, agentId } };
  }
}
