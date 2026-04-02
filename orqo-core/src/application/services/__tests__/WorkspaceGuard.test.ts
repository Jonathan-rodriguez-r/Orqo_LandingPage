import { WorkspaceGuard } from '../WorkspaceGuard.js';
import type { IWorkspaceRepository } from '../../ports/IWorkspaceRepository.js';
import { Ok, Err } from '../../../shared/Result.js';
import { Workspace } from '../../../domain/workspace/entities/Workspace.js';
import { ApiKey } from '../../../domain/workspace/value-objects/ApiKey.js';
import { Branding } from '../../../domain/workspace/value-objects/Branding.js';

function makeRepo(workspace: Workspace | null | 'error'): IWorkspaceRepository {
  return {
    findById: jest.fn().mockResolvedValue(
      workspace === 'error' ? Err(new Error('DB error')) : Ok(workspace),
    ),
    findByApiKeyHash: jest.fn(),
    save: jest.fn(),
    list: jest.fn(),
  };
}

function makeWorkspace(status: 'trial' | 'active' | 'suspended' | 'cancelled', trialEndsAt?: Date): Workspace {
  const { apiKey } = ApiKey.generate();
  const branding = Branding.default('Agente');
  return Workspace.reconstitute({
    id: 'ws-1',
    name: 'Test',
    status,
    apiKey,
    branding,
    limits: { messagesPerMinute: 60, maxActiveConversations: 500 },
    plan: 'starter',
    timezone: 'America/Bogota',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...(trialEndsAt !== undefined ? { trialEndsAt } : {}),
  });
}

describe('WorkspaceGuard', () => {
  it('permite si workspace no existe (backwards-compat)', async () => {
    const guard = new WorkspaceGuard(makeRepo(null));
    const result = await guard.canProcess('ws-unknown');
    expect(result.ok).toBe(true);
  });

  it('permite si hay error de BD (fail-open)', async () => {
    const guard = new WorkspaceGuard(makeRepo('error'));
    const result = await guard.canProcess('ws-1');
    expect(result.ok).toBe(true);
  });

  it('permite workspace activo', async () => {
    const guard = new WorkspaceGuard(makeRepo(makeWorkspace('active')));
    const result = await guard.canProcess('ws-1');
    expect(result.ok).toBe(true);
  });

  it('bloquea workspace suspendido', async () => {
    const guard = new WorkspaceGuard(makeRepo(makeWorkspace('suspended')));
    const result = await guard.canProcess('ws-1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('suspended');
    }
  });

  it('bloquea trial expirado', async () => {
    const past = new Date(Date.now() - 1_000);
    const guard = new WorkspaceGuard(makeRepo(makeWorkspace('trial', past)));
    const result = await guard.canProcess('ws-1');
    expect(result.ok).toBe(false);
  });

  it('permite trial vigente', async () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000);
    const guard = new WorkspaceGuard(makeRepo(makeWorkspace('trial', future)));
    const result = await guard.canProcess('ws-1');
    expect(result.ok).toBe(true);
  });
});
