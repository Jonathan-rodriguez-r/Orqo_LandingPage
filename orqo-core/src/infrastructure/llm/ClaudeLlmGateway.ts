import Anthropic from '@anthropic-ai/sdk';
import { Ok, Err, tryCatch, type Result } from '../../shared/Result.js';
import type {
  ILlmGateway,
  LlmMessage,
  LlmOptions,
  LlmResponse,
} from '../../application/ports/ILlmGateway.js';

/**
 * Implementación del LLM Gateway usando Claude (Anthropic).
 * La Application Layer no sabe qué modelo usa — solo habla con ILlmGateway.
 *
 * Para cambiar a GPT-4 / Gemini: crear OpenAILlmGateway que implemente ILlmGateway
 * y reemplazar en el Container. Cero cambios en el core.
 */
export class ClaudeLlmGateway implements ILlmGateway {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(
    apiKey = process.env['ANTHROPIC_API_KEY'] ?? '',
    model = 'claude-sonnet-4-6',
  ) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async complete(
    messages: LlmMessage[],
    options: LlmOptions = {},
  ): Promise<Result<LlmResponse>> {
    return tryCatch(async () => {
      const tools = options.tools?.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema as Anthropic.Tool['input_schema'],
      }));

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: options.maxTokens ?? 1024,
        system: options.systemPrompt,
        messages: messages.map(m => ({
          role: m.role === 'system' ? 'user' : m.role,
          content: m.content,
        })) as Anthropic.MessageParam[],
        tools: tools && tools.length > 0 ? tools : undefined,
        temperature: options.temperature,
      });

      const textContent = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('');

      const toolCalls = response.content
        .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
        .map(b => ({
          toolName: b.name,
          toolInput: b.input as Record<string, unknown>,
        }));

      return {
        content: textContent,
        toolCalls,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
      } satisfies LlmResponse;
    });
  }
}
