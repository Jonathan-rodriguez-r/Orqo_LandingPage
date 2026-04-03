import { WorkspaceChannelRouter } from '../WorkspaceChannelRouter.js';
import type { IWorkspaceChannelConfigRepository } from '../../../application/ports/IWorkspaceChannelConfigRepository.js';
import { WorkspaceChannelConfig } from '../../../domain/workspace/entities/WorkspaceChannelConfig.js';
import { Ok } from '../../../shared/Result.js';

function makeConfig(workspaceId: string): WorkspaceChannelConfig {
  return WorkspaceChannelConfig.create(workspaceId)
    .withWhatsApp({ phoneNumberId: 'phone-123', encryptedToken: 'enc', tokenPrefix: 'pref' })
    .withInstagram({ igAccountId: 'ig-456', encryptedToken: 'enc', tokenPrefix: 'pref' })
    .withFacebook({ pageId: 'page-789', encryptedToken: 'enc', tokenPrefix: 'pref' });
}

function makeRepo(workspaceId?: string): IWorkspaceChannelConfigRepository {
  const config = workspaceId ? makeConfig(workspaceId) : null;
  return {
    findByWorkspaceId: jest.fn().mockResolvedValue(Ok(config)),
    findByPhoneNumberId: jest.fn().mockResolvedValue(Ok(config)),
    findByIgAccountId: jest.fn().mockResolvedValue(Ok(config)),
    findByPageId: jest.fn().mockResolvedValue(Ok(config)),
    save: jest.fn().mockResolvedValue(Ok(undefined)),
  };
}

describe('WorkspaceChannelRouter', () => {
  describe('resolveByPhoneNumberId', () => {
    it('resuelve workspaceId cuando el phone_number_id está registrado', async () => {
      const router = new WorkspaceChannelRouter(makeRepo('ws-abc'));
      const result = await router.resolveByPhoneNumberId('phone-123');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('ws-abc');
      }
    });

    it('retorna Err cuando no hay workspace para ese phone_number_id', async () => {
      const router = new WorkspaceChannelRouter(makeRepo());
      const result = await router.resolveByPhoneNumberId('unknown-phone');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('phone_number_id');
      }
    });
  });

  describe('resolveByIgAccountId', () => {
    it('resuelve workspaceId cuando el ig_account_id está registrado', async () => {
      const router = new WorkspaceChannelRouter(makeRepo('ws-ig'));
      const result = await router.resolveByIgAccountId('ig-456');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('ws-ig');
      }
    });

    it('retorna Err cuando no hay workspace para ese ig_account_id', async () => {
      const router = new WorkspaceChannelRouter(makeRepo());
      const result = await router.resolveByIgAccountId('unknown-ig');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('ig_account_id');
      }
    });
  });

  describe('resolveByPageId', () => {
    it('resuelve workspaceId cuando el page_id está registrado', async () => {
      const router = new WorkspaceChannelRouter(makeRepo('ws-fb'));
      const result = await router.resolveByPageId('page-789');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('ws-fb');
      }
    });

    it('retorna Err cuando no hay workspace para ese page_id', async () => {
      const router = new WorkspaceChannelRouter(makeRepo());
      const result = await router.resolveByPageId('unknown-page');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('page_id');
      }
    });
  });
});
