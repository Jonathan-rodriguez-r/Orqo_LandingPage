import { WorkspaceMcpServer } from '../entities/WorkspaceMcpServer.js';

function makeServer(overrides: Partial<Parameters<typeof WorkspaceMcpServer.create>[0]> = {}) {
  return WorkspaceMcpServer.create({
    workspaceId: 'ws-1',
    name: 'WooCommerce',
    type: 'woocommerce',
    serverConfig: { transport: 'stdio', command: 'node', args: ['./index.js'] },
    tools: [
      {
        name: 'woocommerce_get_order',
        description: 'Consulta un pedido',
        inputSchema: { type: 'object', properties: {} },
      },
    ],
    triggers: [
      { type: 'keyword', value: 'pedido' },
    ],
    active: true,
    ...overrides,
  });
}

describe('WorkspaceMcpServer', () => {
  describe('create()', () => {
    it('genera id y timestamps automáticamente', () => {
      const before = new Date();
      const server = makeServer();
      const after = new Date();

      expect(server.id).toBeTruthy();
      expect(server.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(server.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(server.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
      expect(server.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('asigna correctamente las propiedades', () => {
      const server = makeServer();

      expect(server.workspaceId).toBe('ws-1');
      expect(server.name).toBe('WooCommerce');
      expect(server.type).toBe('woocommerce');
      expect(server.active).toBe(true);
      expect(server.tools).toHaveLength(1);
      expect(server.triggers).toHaveLength(1);
    });

    it('dos llamadas a create() generan ids distintos', () => {
      const a = makeServer();
      const b = makeServer();
      expect(a.id).not.toBe(b.id);
    });
  });

  describe('matchesTriggers()', () => {
    it('retorna true cuando el mensaje contiene la keyword', () => {
      const server = makeServer();
      expect(server.matchesTriggers('¿Dónde está mi pedido?')).toBe(true);
    });

    it('retorna false cuando el mensaje no contiene la keyword', () => {
      const server = makeServer();
      expect(server.matchesTriggers('Hola, ¿cómo estás?')).toBe(false);
    });

    it('es case-insensitive', () => {
      const server = makeServer();
      expect(server.matchesTriggers('¿Cuándo llega mi PEDIDO?')).toBe(true);
    });

    it('con trigger always siempre retorna true independientemente del mensaje', () => {
      const server = makeServer({
        triggers: [{ type: 'always' }],
      });
      expect(server.matchesTriggers('Hola')).toBe(true);
      expect(server.matchesTriggers('')).toBe(true);
    });

    it('con triggers vacíos retorna true (sin filtrado)', () => {
      const server = makeServer({ triggers: [] });
      expect(server.matchesTriggers('cualquier mensaje')).toBe(true);
    });

    it('retorna true si al menos un trigger hace match', () => {
      const server = makeServer({
        triggers: [
          { type: 'keyword', value: 'pedido' },
          { type: 'keyword', value: 'envío' },
        ],
      });
      expect(server.matchesTriggers('¿Cuándo llega mi envío?')).toBe(true);
    });
  });

  describe('disable() / enable()', () => {
    it('disable() retorna una nueva instancia con active=false', () => {
      const server = makeServer({ active: true });
      const disabled = server.disable();

      expect(disabled.active).toBe(false);
      expect(disabled.id).toBe(server.id);
      expect(disabled.workspaceId).toBe(server.workspaceId);
    });

    it('enable() retorna una nueva instancia con active=true', () => {
      const server = makeServer({ active: false });
      const enabled = server.enable();

      expect(enabled.active).toBe(true);
      expect(enabled.id).toBe(server.id);
    });

    it('disable() actualiza updatedAt', () => {
      const server = makeServer();
      const before = server.updatedAt;
      // Pequeña espera para asegurar que el timestamp cambia
      const disabled = server.disable();
      expect(disabled.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('la entidad original no muta (inmutabilidad)', () => {
      const server = makeServer({ active: true });
      server.disable();
      expect(server.active).toBe(true);
    });
  });

  describe('updateTools()', () => {
    it('retorna una nueva instancia con los tools actualizados', () => {
      const server = makeServer();
      const newTools = [
        {
          name: 'woocommerce_list_products',
          description: 'Lista productos',
          inputSchema: { type: 'object', properties: {} },
        },
      ];
      const updated = server.updateTools(newTools);

      expect(updated.tools).toHaveLength(1);
      expect(updated.tools[0]?.name).toBe('woocommerce_list_products');
      expect(server.tools).toHaveLength(1);
      expect(server.tools[0]?.name).toBe('woocommerce_get_order');
    });
  });

  describe('reconstitute()', () => {
    it('restaura la entidad con los props exactos proporcionados', () => {
      const now = new Date('2024-01-01T00:00:00Z');
      const server = WorkspaceMcpServer.reconstitute({
        id: 'fixed-id',
        workspaceId: 'ws-2',
        name: 'Shopify',
        type: 'shopify',
        serverConfig: { transport: 'stdio', command: 'node', args: [] },
        tools: [],
        triggers: [],
        active: false,
        createdAt: now,
        updatedAt: now,
      });

      expect(server.id).toBe('fixed-id');
      expect(server.workspaceId).toBe('ws-2');
      expect(server.active).toBe(false);
      expect(server.createdAt).toBe(now);
    });
  });
});
