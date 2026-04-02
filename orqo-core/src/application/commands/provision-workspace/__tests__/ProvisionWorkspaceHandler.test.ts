import { ProvisionWorkspaceHandler } from '../ProvisionWorkspaceHandler.js';
import { createProvisionWorkspaceCommand } from '../ProvisionWorkspaceCommand.js';
import type { IWorkspaceRepository } from '../../../ports/IWorkspaceRepository.js';
import type { IAgentRepository } from '../../../ports/IAgentRepository.js';
import type { ITenantPolicyRepository } from '../../../ports/ITenantPolicyRepository.js';
import { Ok } from '../../../../shared/Result.js';

function makeRepos() {
  const workspaceRepo: IWorkspaceRepository = {
    findById: jest.fn().mockResolvedValue(Ok(null)),
    findByApiKeyHash: jest.fn().mockResolvedValue(Ok(null)),
    save: jest.fn().mockResolvedValue(Ok(undefined)),
    list: jest.fn().mockResolvedValue(Ok([])),
  };
  const agentRepo: IAgentRepository = {
    findById: jest.fn().mockResolvedValue(null),
    findActiveByWorkspace: jest.fn().mockResolvedValue(null),
    save: jest.fn().mockResolvedValue(undefined),
  };
  const policyRepo: ITenantPolicyRepository = {
    findByWorkspaceId: jest.fn().mockResolvedValue(null),
    save: jest.fn().mockResolvedValue(undefined),
  };
  return { workspaceRepo, agentRepo, policyRepo };
}

describe('ProvisionWorkspaceHandler', () => {
  it('provisiona workspace, agente y política por defecto', async () => {
    const { workspaceRepo, agentRepo, policyRepo } = makeRepos();
    const handler = new ProvisionWorkspaceHandler(workspaceRepo, agentRepo, policyRepo);

    const command = createProvisionWorkspaceCommand({ name: 'Tienda Test', agentName: 'Sofía' });
    const result = await handler.handle(command);

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;

    expect(result.value.workspaceId).toBeTruthy();
    expect(result.value.agentId).toBeTruthy();
    expect(result.value.apiKeyPlaintext).toMatch(/^orqo_[0-9a-f]{64}$/);

    expect(workspaceRepo.save).toHaveBeenCalledTimes(1);
    expect(agentRepo.save).toHaveBeenCalledTimes(1);
    expect(policyRepo.save).toHaveBeenCalledTimes(1);

    // El agente debe estar en el mismo workspace
    const savedAgent = (agentRepo.save as jest.Mock).mock.calls[0][0];
    expect(savedAgent.workspaceId).toBe(result.value.workspaceId);
    expect(savedAgent.name).toBe('Sofía');
    expect(savedAgent.active).toBe(true);

    // La política debe ser para el mismo workspace
    const savedPolicy = (policyRepo.save as jest.Mock).mock.calls[0][0];
    expect(savedPolicy.workspaceId).toBe(result.value.workspaceId);
    expect(savedPolicy.primary.model).toBeTruthy();
  });

  it('falla con nombre vacío', async () => {
    const { workspaceRepo, agentRepo, policyRepo } = makeRepos();
    const handler = new ProvisionWorkspaceHandler(workspaceRepo, agentRepo, policyRepo);

    const command = createProvisionWorkspaceCommand({ name: '' });
    const result = await handler.handle(command);

    expect(result.ok).toBe(false);
    expect(workspaceRepo.save).not.toHaveBeenCalled();
  });
});
