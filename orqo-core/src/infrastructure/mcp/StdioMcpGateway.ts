import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Ok, Err, tryCatch, type Result } from '../../shared/Result.js';
import type { IMcpGateway, McpSession, McpTool, McpToolResult } from '../../application/ports/IMcpGateway.js';
import type { McpServerConfig } from '../../domain/skill/SkillManifest.js';

interface ActiveSession {
  client: Client;
  transport: StdioClientTransport;
}

/**
 * Implementación del MCP Gateway usando transporte stdio.
 *
 * Gestiona el ciclo de vida completo del proceso MCP:
 *   connect() → spawn proceso → handshake → listo para tools
 *   callTool() → llama al tool del servidor
 *   disconnect() → cierra proceso limpiamente
 *
 * Para SSE o HTTP: crear SseMcpGateway que implemente IMcpGateway.
 */
export class StdioMcpGateway implements IMcpGateway {
  private readonly sessions = new Map<string, ActiveSession>();

  async connect(config: McpServerConfig): Promise<Result<McpSession>> {
    if (config.transport !== 'stdio' || !config.command) {
      return Err(new Error('StdioMcpGateway solo soporta transporte stdio'));
    }

    return tryCatch(async () => {
      const transport = new StdioClientTransport({
        command: config.command!,
        args: config.args ?? [],
        env: { ...process.env, ...config.env } as Record<string, string>,
      });

      const client = new Client(
        { name: 'orqo-core', version: '0.9.0' },
        { capabilities: { tools: {} } },
      );

      await client.connect(transport);

      const sessionId = crypto.randomUUID();
      this.sessions.set(sessionId, { client, transport });

      return {
        sessionId,
        serverName: config.command,
      } satisfies McpSession;
    });
  }

  async listTools(session: McpSession): Promise<Result<McpTool[]>> {
    const active = this.sessions.get(session.sessionId);
    if (!active) return Err(new Error(`Sesión no encontrada: ${session.sessionId}`));

    return tryCatch(async () => {
      const result = await active.client.listTools();
      return result.tools.map(t => ({
        name: t.name,
        description: t.description ?? '',
        inputSchema: t.inputSchema as Record<string, unknown>,
      }));
    });
  }

  async callTool(
    session: McpSession,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<Result<McpToolResult>> {
    const active = this.sessions.get(session.sessionId);
    if (!active) return Err(new Error(`Sesión no encontrada: ${session.sessionId}`));

    return tryCatch(async () => {
      const result = await active.client.callTool({ name: toolName, arguments: args });
      return {
        content: (result.content as any[]).map((c: any) => ({
          type: c.type ?? 'text',
          text: c.text,
          mimeType: c.mimeType,
          data: c.data,
        })),
        isError: result.isError as boolean | undefined,
      } satisfies McpToolResult;
    });
  }

  async disconnect(session: McpSession): Promise<void> {
    const active = this.sessions.get(session.sessionId);
    if (!active) return;

    try {
      await active.client.close();
    } finally {
      this.sessions.delete(session.sessionId);
    }
  }
}
