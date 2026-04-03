import type { LlmTool } from './ILlmGateway.js';
import type { McpToolResult } from './IMcpGateway.js';
import type { Result } from '../../shared/Result.js';

export interface IWorkspaceMcpRegistry {
  /** Retorna las LlmTools de todos los MCP activos para el workspace filtradas por el mensaje */
  getTools(workspaceId: string, message: string): Promise<LlmTool[]>;
  /** Ejecuta una tool en el servidor MCP correspondiente */
  callTool(
    workspaceId: string,
    toolName: string,
    args: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<Result<McpToolResult>>;
  /** Invalida el cache del workspace (llamar tras añadir/quitar MCPs) */
  invalidate(workspaceId: string): void;
}
