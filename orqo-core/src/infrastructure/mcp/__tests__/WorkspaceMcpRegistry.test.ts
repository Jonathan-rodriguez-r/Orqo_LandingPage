import { WorkspaceMcpRegistry } from '../WorkspaceMcpRegistry.js';
import { WorkspaceMcpServer } from '../../../domain/workspace/entities/WorkspaceMcpServer.js';
import { Ok, Err } from '../../../shared/Result.js';
import type { IWorkspaceMcpRepository } from '../../../application/ports/IWorkspaceMcpRepository.js';
import type { IMcpGateway } from '../../../application/ports/IMcpGateway.js';

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
    triggers: [{ type: 'keyword', value: 'pedido' }],
    active: true,
    ...overrides,
  });
}

function makeRepo(servers: WorkspaceMcpServer[] = []): IWorkspaceMcpRepository {
  return {
    findById: jest.fn().mockResolvedValue(Ok(servers[0] ?? null)),
    findByWorkspace: jest.fn().mockResolvedValue(Ok(servers)),
    save: jest.fn().mockResolvedValue(Ok(undefined)),
    delete: jest.fn().mockResolvedValue(Ok(undefined)),
  };
}

function makeGateway(): IMcpGateway {
  return {
    connect: jest.fn().mockResolvedValue(Ok({ sessionId: 'sess-1', serverName: 'test' })),
    listTools: jest.fn().mockResolvedValue(Ok([])),
    callTool: jest.fn().mockResolvedValue(Ok({
      content: [{ type: 'text', text: 'resultado' }],
    })),
    disconnect: jest.fn().mockResolvedValue(undefined),
  };
}

describe('WorkspaceMcpRegistry', () => {
  describe('getTools()', () => {
    it('retorna tools de servers activos filtradas por trigger', async () => {
      const server = makeServer({ active: true });
      const repo = makeRepo([server]);
      const registry = new WorkspaceMcpRegistry(repo, makeGateway(), makeGateway());

      const tools = await registry.getTools('ws-1', '¿Dónde está mi pedido?');

      expect(tools).toHaveLength(1);
      expect(tools[0]?.name).toBe('woocommerce_get_order');
    });

    it('retorna array vacío si el mensaje no coincide con triggers', async () => {
      const server = makeServer({ active: true });
      const repo = makeRepo([server]);
      const registry = new WorkspaceMcpRegistry(repo, makeGateway(), makeGateway());

      const tools = await registry.getTools('ws-1', 'Hola, ¿qué tal?');

      expect(tools).toHaveLength(0);
    });

    it('ignora servers inactivos', async () => {
      const server = makeServer({ active: false });
      const repo = makeRepo([server]);
      const registry = new WorkspaceMcpRegistry(repo, makeGateway(), makeGateway());

      const tools = await registry.getTools('ws-1', '¿Dónde está mi pedido?');

      expect(tools).toHaveLength(0);
    });

    it('cachea resultados — el repo solo se llama una vez en llamadas consecutivas', async () => {
      const server = makeServer({ active: true });
      const repo = makeRepo([server]);
      const registry = new WorkspaceMcpRegistry(repo, makeGateway(), makeGateway());

      await registry.getTools('ws-1', 'pedido');
      await registry.getTools('ws-1', 'pedido');
      await registry.getTools('ws-1', 'pedido');

      expect(repo.findByWorkspace).toHaveBeenCalledTimes(1);
    });

    it('workspaces distintos tienen caches independientes', async () => {
      const server = makeServer({ active: true });
      const repo = makeRepo([server]);
      const registry = new WorkspaceMcpRegistry(repo, makeGateway(), makeGateway());

      await registry.getTools('ws-1', 'pedido');
      await registry.getTools('ws-2', 'pedido');

      expect(repo.findByWorkspace).toHaveBeenCalledTimes(2);
    });
  });

  describe('invalidate()', () => {
    it('limpia el cache para que el repo se consulte de nuevo', async () => {
      const server = makeServer({ active: true });
      const repo = makeRepo([server]);
      const registry = new WorkspaceMcpRegistry(repo, makeGateway(), makeGateway());

      await registry.getTools('ws-1', 'pedido');
      registry.invalidate('ws-1');
      await registry.getTools('ws-1', 'pedido');

      expect(repo.findByWorkspace).toHaveBeenCalledTimes(2);
    });
  });

  describe('callTool()', () => {
    it('delega al stdioGateway para servidores con transport stdio', async () => {
      const server = makeServer({
        active: true,
        serverConfig: { transport: 'stdio', command: 'node', args: [] },
      });
      const repo = makeRepo([server]);
      const stdioGateway = makeGateway();
      const httpGateway = makeGateway();
      const registry = new WorkspaceMcpRegistry(repo, stdioGateway, httpGateway);

      const result = await registry.callTool('ws-1', 'woocommerce_get_order', {}, 5000);

      expect(result.ok).toBe(true);
      expect(stdioGateway.connect).toHaveBeenCalled();
      expect(httpGateway.connect).not.toHaveBeenCalled();
    });

    it('delega al httpGateway para servidores con transport sse', async () => {
      const server = makeServer({
        active: true,
        serverConfig: { transport: 'sse', url: 'http://localhost:8080' },
      });
      const repo = makeRepo([server]);
      const stdioGateway = makeGateway();
      const httpGateway = makeGateway();
      const registry = new WorkspaceMcpRegistry(repo, stdioGateway, httpGateway);

      const result = await registry.callTool('ws-1', 'woocommerce_get_order', {}, 5000);

      expect(result.ok).toBe(true);
      expect(httpGateway.connect).toHaveBeenCalled();
      expect(stdioGateway.connect).not.toHaveBeenCalled();
    });

    it('delega al httpGateway para servidores con transport http', async () => {
      const server = makeServer({
        active: true,
        serverConfig: { transport: 'http', url: 'http://localhost:8080' },
      });
      const repo = makeRepo([server]);
      const stdioGateway = makeGateway();
      const httpGateway = makeGateway();
      const registry = new WorkspaceMcpRegistry(repo, stdioGateway, httpGateway);

      const result = await registry.callTool('ws-1', 'woocommerce_get_order', {}, 5000);

      expect(result.ok).toBe(true);
      expect(httpGateway.connect).toHaveBeenCalled();
    });

    it('retorna Err si la tool no existe en el workspace', async () => {
      const repo = makeRepo([]);
      const registry = new WorkspaceMcpRegistry(repo, makeGateway(), makeGateway());

      const result = await registry.callTool('ws-1', 'tool_inexistente', {}, 5000);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('tool_inexistente');
      }
    });

    it('retorna Err si el gateway no puede conectar', async () => {
      const server = makeServer({ active: true });
      const repo = makeRepo([server]);
      const failingGateway: IMcpGateway = {
        connect: jest.fn().mockResolvedValue(Err(new Error('Conexión fallida'))),
        listTools: jest.fn().mockResolvedValue(Ok([])),
        callTool: jest.fn().mockResolvedValue(Ok({ content: [] })),
        disconnect: jest.fn().mockResolvedValue(undefined),
      };
      const registry = new WorkspaceMcpRegistry(repo, failingGateway, makeGateway());

      const result = await registry.callTool('ws-1', 'woocommerce_get_order', {}, 5000);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Conexión fallida');
      }
    });

    it('desconecta la sesión aunque el callTool falle', async () => {
      const server = makeServer({ active: true });
      const repo = makeRepo([server]);
      const failingGateway: IMcpGateway = {
        connect: jest.fn().mockResolvedValue(Ok({ sessionId: 'sess-1', serverName: 'test' })),
        listTools: jest.fn().mockResolvedValue(Ok([])),
        callTool: jest.fn().mockRejectedValue(new Error('Error de red')),
        disconnect: jest.fn().mockResolvedValue(undefined),
      };
      const registry = new WorkspaceMcpRegistry(repo, failingGateway, makeGateway());

      await registry.callTool('ws-1', 'woocommerce_get_order', {}, 5000);

      expect(failingGateway.disconnect).toHaveBeenCalled();
    });
  });
});
