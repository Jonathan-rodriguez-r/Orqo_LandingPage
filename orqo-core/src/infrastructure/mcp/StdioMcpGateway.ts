import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Err, tryCatch, type Result } from '../../shared/Result.js';
import type {
  IMcpGateway,
  McpSession,
  McpTool,
  McpToolResult,
} from '../../application/ports/IMcpGateway.js';
import type { McpServerConfig } from '../../domain/skill/SkillManifest.js';

interface ActiveSession {
  client: Client;
  transport: StdioClientTransport;
}

export class StdioMcpGateway implements IMcpGateway {
  private readonly sessions = new Map<string, ActiveSession>();

  async connect(config: McpServerConfig): Promise<Result<McpSession>> {
    const command = config.command;
    if (config.transport !== 'stdio' || !command) {
      return Err(new Error('StdioMcpGateway solo soporta transporte stdio'));
    }

    return tryCatch(async () => {
      const transport = new StdioClientTransport({
        command,
        args: config.args ?? [],
        env: { ...process.env, ...config.env } as Record<string, string>,
      });

      const client = new Client(
        { name: 'orqo-core', version: '0.1.0' },
        { capabilities: { tools: {} } },
      );

      await client.connect(transport);

      const sessionId = crypto.randomUUID();
      this.sessions.set(sessionId, { client, transport });

      return {
        sessionId,
        serverName: command,
      };
    });
  }

  async listTools(session: McpSession): Promise<Result<McpTool[]>> {
    const active = this.sessions.get(session.sessionId);
    if (!active) {
      return Err(new Error(`Sesion no encontrada: ${session.sessionId}`));
    }

    return tryCatch(async () => {
      const result = await active.client.listTools();
      const tools = Array.isArray(result.tools) ? result.tools : [];

      return tools.map((tool: any) => ({
        name: String(tool.name ?? ''),
        description: String(tool.description ?? ''),
        inputSchema: (tool.inputSchema ?? {}) as Record<string, unknown>,
      }));
    });
  }

  async callTool(
    session: McpSession,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<Result<McpToolResult>> {
    const active = this.sessions.get(session.sessionId);
    if (!active) {
      return Err(new Error(`Sesion no encontrada: ${session.sessionId}`));
    }

    return tryCatch(async () => {
      const result = await active.client.callTool({ name: toolName, arguments: args });
      const contentBlocks = Array.isArray(result.content) ? result.content : [];
      const normalizedContent = contentBlocks.map((content: any) => ({
        type: (content.type ?? 'text') as 'text' | 'image' | 'resource',
        text: content.text as string | undefined,
        mimeType: content.mimeType as string | undefined,
        data: content.data as string | undefined,
      }));

      const normalizedResult: McpToolResult = {
        content: normalizedContent,
      };

      if (result.isError !== undefined) {
        normalizedResult.isError = Boolean(result.isError);
      }

      return normalizedResult;
    });
  }

  async disconnect(session: McpSession): Promise<void> {
    const active = this.sessions.get(session.sessionId);
    if (!active) {
      return;
    }

    try {
      await active.client.close();
    } finally {
      this.sessions.delete(session.sessionId);
    }
  }
}
