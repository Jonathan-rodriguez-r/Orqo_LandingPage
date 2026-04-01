import type { McpServerConfig } from '../../domain/skill/SkillManifest.js';
import type { Result } from '../../shared/Result.js';

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpContentBlock {
  type: 'text' | 'image' | 'resource';
  text?: string;
  mimeType?: string;
  data?: string;
}

export interface McpToolResult {
  content: McpContentBlock[];
  isError?: boolean | undefined;
}

export interface McpSession {
  readonly sessionId: string;
  readonly serverName: string;
}

export interface IMcpGateway {
  connect(config: McpServerConfig): Promise<Result<McpSession>>;
  listTools(session: McpSession): Promise<Result<McpTool[]>>;
  callTool(
    session: McpSession,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<Result<McpToolResult>>;
  disconnect(session: McpSession): Promise<void>;
}
