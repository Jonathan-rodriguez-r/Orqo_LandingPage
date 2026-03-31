import type { Result } from '../../shared/Result.js';

export interface LlmMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/** Tool / function definition que el LLM puede invocar. */
export interface LlmTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface LlmToolCall {
  toolName: string;
  toolInput: Record<string, unknown>;
}

export interface LlmResponse {
  /** Respuesta textual cuando el LLM no invocó ninguna tool. */
  content: string;
  /** Tool calls solicitadas por el LLM (puede ser vacío). */
  toolCalls: LlmToolCall[];
  usage: { inputTokens: number; outputTokens: number };
}

export interface LlmOptions {
  systemPrompt?: string;
  tools?: LlmTool[];
  maxTokens?: number;
  temperature?: number;
}

/**
 * Puerto del LLM Gateway.
 * Implementaciones: ClaudeLlmGateway, OpenAILlmGateway, etc.
 * La Application Layer no sabe qué modelo usa.
 */
export interface ILlmGateway {
  complete(messages: LlmMessage[], options?: LlmOptions): Promise<Result<LlmResponse>>;
}
