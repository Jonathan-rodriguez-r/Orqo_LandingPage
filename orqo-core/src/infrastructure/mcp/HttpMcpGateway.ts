import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
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
  transport: SSEClientTransport;
}

export class HttpMcpGateway implements IMcpGateway {
  private readonly sessions = new Map<string, ActiveSession>();

  async connect(config: McpServerConfig): Promise<Result<McpSession>> {
    if (config.transport !== 'sse' && config.transport !== 'http') {
      return Err(new Error('HttpMcpGateway solo soporta transporte sse o http'));
    }
    if (!config.url) {
      return Err(new Error('HttpMcpGateway requiere url en la configuración'));
    }

    return tryCatch(async () => {
      const transport = new SSEClientTransport(new URL(config.url!));
      const client = new Client(
        { name: 'orqo-core', version: '0.1.0' },
        { capabilities: { tools: {} } },
      );
      await client.connect(transport);

      const sessionId = crypto.randomUUID();
      this.sessions.set(sessionId, { client, transport });
      return { sessionId, serverName: config.url! };
    });
  }

  async listTools(session: McpSession): Promise<Result<McpTool[]>> {
    const active = this.sessions.get(session.sessionId);
    if (!active) return Err(new Error(`Sesión no encontrada: ${session.sessionId}`));

    return tryCatch(async () => {
      const result = await active.client.listTools();
      const tools = Array.isArray(result.tools) ? result.tools : [];
      return tools.map((tool: unknown) => {
        const t = tool as Record<string, unknown>;
        return {
          name: String(t['name'] ?? ''),
          description: String(t['description'] ?? ''),
          inputSchema: (t['inputSchema'] ?? {}) as Record<string, unknown>,
        };
      });
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
      const contentBlocks = Array.isArray(result.content) ? result.content : [];
      return {
        content: contentBlocks.map((c: unknown) => {
          const block = c as Record<string, unknown>;
          return {
            type: (block['type'] ?? 'text') as 'text' | 'image' | 'resource',
            text: block['text'] as string | undefined,
            mimeType: block['mimeType'] as string | undefined,
            data: block['data'] as string | undefined,
          };
        }),
        ...(result.isError !== undefined ? { isError: Boolean(result.isError) } : {}),
      };
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
