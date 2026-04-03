import { WorkspaceChannelConfig } from '../entities/WorkspaceChannelConfig.js';

describe('WorkspaceChannelConfig', () => {
  it('crea una config vacía', () => {
    const config = WorkspaceChannelConfig.create('ws-1');
    expect(config.workspaceId).toBe('ws-1');
    expect(config.whatsapp).toBeUndefined();
    expect(config.instagram).toBeUndefined();
    expect(config.facebook).toBeUndefined();
  });

  it('withWhatsApp agrega configuracion de WhatsApp', () => {
    const config = WorkspaceChannelConfig.create('ws-1').withWhatsApp({
      phoneNumberId: 'phone-123',
      encryptedToken: 'enc:tok:en',
      tokenPrefix: 'EAABcdef1234',
    });

    expect(config.whatsapp).toBeDefined();
    expect(config.whatsapp?.phoneNumberId).toBe('phone-123');
    expect(config.whatsapp?.tokenPrefix).toBe('EAABcdef1234');
    expect(config.instagram).toBeUndefined();
    expect(config.facebook).toBeUndefined();
  });

  it('withInstagram agrega configuracion de Instagram', () => {
    const config = WorkspaceChannelConfig.create('ws-1').withInstagram({
      igAccountId: 'ig-456',
      encryptedToken: 'enc:tok:en',
      tokenPrefix: 'IGTok123456',
    });

    expect(config.instagram).toBeDefined();
    expect(config.instagram?.igAccountId).toBe('ig-456');
    expect(config.whatsapp).toBeUndefined();
    expect(config.facebook).toBeUndefined();
  });

  it('withFacebook agrega configuracion de Facebook', () => {
    const config = WorkspaceChannelConfig.create('ws-1').withFacebook({
      pageId: 'page-789',
      encryptedToken: 'enc:tok:en',
      tokenPrefix: 'FBTok1234567',
    });

    expect(config.facebook).toBeDefined();
    expect(config.facebook?.pageId).toBe('page-789');
    expect(config.whatsapp).toBeUndefined();
    expect(config.instagram).toBeUndefined();
  });

  it('withoutChannel elimina solo el canal indicado', () => {
    const config = WorkspaceChannelConfig.create('ws-1')
      .withWhatsApp({ phoneNumberId: 'phone-123', encryptedToken: 'enc', tokenPrefix: 'pref' })
      .withInstagram({ igAccountId: 'ig-456', encryptedToken: 'enc', tokenPrefix: 'pref' })
      .withFacebook({ pageId: 'page-789', encryptedToken: 'enc', tokenPrefix: 'pref' });

    const withoutWa = config.withoutChannel('whatsapp');
    expect(withoutWa.whatsapp).toBeUndefined();
    expect(withoutWa.instagram).toBeDefined();
    expect(withoutWa.facebook).toBeDefined();

    const withoutIg = config.withoutChannel('instagram');
    expect(withoutIg.instagram).toBeUndefined();
    expect(withoutIg.whatsapp).toBeDefined();
    expect(withoutIg.facebook).toBeDefined();

    const withoutFb = config.withoutChannel('facebook');
    expect(withoutFb.facebook).toBeUndefined();
    expect(withoutFb.whatsapp).toBeDefined();
    expect(withoutFb.instagram).toBeDefined();
  });

  it('toPublic() nunca expone encryptedToken', () => {
    const config = WorkspaceChannelConfig.create('ws-1')
      .withWhatsApp({ phoneNumberId: 'phone-123', encryptedToken: 'super-secret-token', tokenPrefix: 'EAABcdef1234' })
      .withInstagram({ igAccountId: 'ig-456', encryptedToken: 'super-secret-ig', tokenPrefix: 'IGTok123456' })
      .withFacebook({ pageId: 'page-789', encryptedToken: 'super-secret-fb', tokenPrefix: 'FBTok1234567' });

    const pub = config.toPublic() as Record<string, unknown>;
    const pubStr = JSON.stringify(pub);

    expect(pubStr).not.toContain('super-secret-token');
    expect(pubStr).not.toContain('super-secret-ig');
    expect(pubStr).not.toContain('super-secret-fb');
    expect(pubStr).not.toContain('encryptedToken');

    // Should contain the safe fields
    expect(pubStr).toContain('phone-123');
    expect(pubStr).toContain('EAABcdef1234');
    expect(pubStr).toContain('ig-456');
    expect(pubStr).toContain('page-789');
  });

  it('reconstitute recrea desde props', () => {
    const updatedAt = new Date('2026-01-01');
    const config = WorkspaceChannelConfig.reconstitute({
      workspaceId: 'ws-99',
      updatedAt,
      whatsapp: { phoneNumberId: 'pid', encryptedToken: 'enc', tokenPrefix: 'tok' },
    });

    expect(config.workspaceId).toBe('ws-99');
    expect(config.updatedAt).toEqual(updatedAt);
    expect(config.whatsapp?.phoneNumberId).toBe('pid');
    expect(config.instagram).toBeUndefined();
  });
});
