import { Err, tryCatch, type Result } from '../../shared/Result.js';
import type { IWorkspaceMcpRepository } from '../../application/ports/IWorkspaceMcpRepository.js';
import type { IWorkspaceMcpRegistry } from '../../application/ports/IWorkspaceMcpRegistry.js';
import type { IMcpGateway, McpToolResult } from '../../application/ports/IMcpGateway.js';
import type { LlmTool } from '../../application/ports/ILlmGateway.js';
import type { WorkspaceMcpServer } from '../../domain/workspace/entities/WorkspaceMcpServer.js';
import type { ILogger } from '../../shared/Logger.js';
import { NoopLogger } from '../../shared/Logger.js';

interface CacheEntry {
  servers: WorkspaceMcpServer[];
  loadedAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1_000; // 5 minutos

/**
 * Registro dinámico de servidores MCP por workspace.
 * Carga configs de MongoDB lazy (al primer uso) y las cachea 5 minutos.
 * Invalidar manualmente con invalidate(workspaceId) tras cambios en BD.
 */
export class WorkspaceMcpRegistry implements IWorkspaceMcpRegistry {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly mcpRepo: IWorkspaceMcpRepository,
    private readonly stdioGateway: IMcpGateway,
    private readonly httpGateway: IMcpGateway,
    private readonly logger: ILogger = new NoopLogger(),
  ) {}

  async getTools(workspaceId: string, message: string): Promise<LlmTool[]> {
    const servers = await this._loadServers(workspaceId);
    const tools: LlmTool[] = [];

    for (const server of servers) {
      if (!server.active) continue;
      if (!server.matchesTriggers(message)) continue;

      for (const tool of server.tools) {
        tools.push({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        });
      }
    }

    return tools;
  }

  async callTool(
    workspaceId: string,
    toolName: string,
    args: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<Result<McpToolResult>> {
    const servers = await this._loadServers(workspaceId);
    const server = servers.find(s => s.active && s.tools.some(t => t.name === toolName));

    if (!server) {
      return Err(new Error(`Tool '${toolName}' no encontrada en workspace ${workspaceId}`));
    }

    const gateway = this._gatewayFor(server);

    const sessionResult = await gateway.connect(server.serverConfig);
    if (!sessionResult.ok) {
      this.logger.error('No se pudo conectar al servidor MCP', {
        workspaceId,
        serverName: server.name,
        error: sessionResult.error.message,
      });
      return Err(sessionResult.error);
    }

    const session = sessionResult.value;

    const callResult = await tryCatch(async () => {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout en tool '${toolName}' (${timeoutMs}ms)`)), timeoutMs),
      );
      return Promise.race([gateway.callTool(session, toolName, args), timeoutPromise]);
    });

    await gateway.disconnect(session);

    if (!callResult.ok) {
      return Err(callResult.error);
    }

    return callResult.value;
  }

  invalidate(workspaceId: string): void {
    this.cache.delete(workspaceId);
  }

  private async _loadServers(workspaceId: string): Promise<WorkspaceMcpServer[]> {
    const cached = this.cache.get(workspaceId);
    if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
      return cached.servers;
    }

    const result = await this.mcpRepo.findByWorkspace(workspaceId);
    if (!result.ok) {
      this.logger.warn('Error cargando MCP servers del workspace', {
        workspaceId,
        error: result.error.message,
      });
      return [];
    }

    this.cache.set(workspaceId, { servers: result.value, loadedAt: Date.now() });
    return result.value;
  }

  private _gatewayFor(server: WorkspaceMcpServer): IMcpGateway {
    const transport = server.serverConfig.transport;
    if (transport === 'sse' || transport === 'http') {
      return this.httpGateway;
    }
    return this.stdioGateway;
  }
}
