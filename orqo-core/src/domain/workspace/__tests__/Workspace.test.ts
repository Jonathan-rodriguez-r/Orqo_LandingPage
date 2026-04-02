import { Workspace } from '../entities/Workspace.js';
import { ApiKey } from '../value-objects/ApiKey.js';
import { Branding } from '../value-objects/Branding.js';

describe('Workspace', () => {
  describe('provision', () => {
    it('crea un workspace en estado trial', () => {
      const result = Workspace.provision({ name: 'Tienda Demo' });
      expect(result.ok).toBe(true);
      if (!result.ok) throw result.error;

      const { workspace, apiKeyPlaintext } = result.value;
      expect(workspace.status).toBe('trial');
      expect(workspace.name).toBe('Tienda Demo');
      expect(workspace.id).toBeTruthy();
      expect(apiKeyPlaintext).toMatch(/^orqo_[0-9a-f]{64}$/);
      expect(workspace.trialEndsAt).toBeDefined();
      expect(workspace.isOperational).toBe(true);
    });

    it('falla con nombre vacío', () => {
      const result = Workspace.provision({ name: '' });
      expect(result.ok).toBe(false);
    });

    it('falla con nombre demasiado largo', () => {
      const result = Workspace.provision({ name: 'A'.repeat(129) });
      expect(result.ok).toBe(false);
    });
  });

  describe('isOperational', () => {
    function makeWorkspace(status: 'trial' | 'active' | 'suspended' | 'cancelled', trialEndsAt?: Date) {
      const { apiKey } = ApiKey.generate();
      const branding = Branding.default('Agente');
      return Workspace.reconstitute({
        id: 'ws-test',
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

    it('activo → operacional', () => {
      expect(makeWorkspace('active').isOperational).toBe(true);
    });

    it('trial vigente → operacional', () => {
      const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000);
      expect(makeWorkspace('trial', future).isOperational).toBe(true);
    });

    it('trial expirado → no operacional', () => {
      const past = new Date(Date.now() - 1_000);
      expect(makeWorkspace('trial', past).isOperational).toBe(false);
    });

    it('suspendido → no operacional', () => {
      expect(makeWorkspace('suspended').isOperational).toBe(false);
    });

    it('cancelado → no operacional', () => {
      expect(makeWorkspace('cancelled').isOperational).toBe(false);
    });
  });

  describe('ciclo de vida', () => {
    let workspace: Workspace;

    beforeEach(() => {
      const r = Workspace.provision({ name: 'Test WS' });
      if (!r.ok) throw r.error;
      workspace = r.value.workspace;
    });

    it('trial → active', () => {
      const r = workspace.activate();
      expect(r.ok).toBe(true);
      if (!r.ok) throw r.error;
      expect(r.value.status).toBe('active');
      expect(r.value.trialEndsAt).toBeUndefined();
    });

    it('active → suspended', () => {
      const activated = workspace.activate();
      if (!activated.ok) throw activated.error;
      const r = activated.value.suspend();
      expect(r.ok).toBe(true);
      if (!r.ok) throw r.error;
      expect(r.value.status).toBe('suspended');
    });

    it('suspended → active (reactivación)', () => {
      const suspended = workspace.suspend();
      if (!suspended.ok) throw suspended.error;
      const r = suspended.value.activate();
      expect(r.ok).toBe(true);
      if (!r.ok) throw r.error;
      expect(r.value.status).toBe('active');
    });

    it('cancelado no se puede activar', () => {
      const cancelled = workspace.cancel();
      if (!cancelled.ok) throw cancelled.error;
      const r = cancelled.value.activate();
      expect(r.ok).toBe(false);
    });
  });

  describe('rotateApiKey', () => {
    it('genera un plaintext diferente y el hash cambia', () => {
      const r = Workspace.provision({ name: 'Test' });
      if (!r.ok) throw r.error;
      const { workspace, apiKeyPlaintext } = r.value;

      const { workspace: updated, apiKeyPlaintext: newKey } = workspace.rotateApiKey();
      expect(newKey).not.toBe(apiKeyPlaintext);
      expect(updated.apiKey.hash).not.toBe(workspace.apiKey.hash);
      expect(updated.apiKey.verify(newKey)).toBe(true);
      expect(updated.apiKey.verify(apiKeyPlaintext)).toBe(false);
    });
  });
});
