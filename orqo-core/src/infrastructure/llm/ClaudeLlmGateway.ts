import Anthropic from '@anthropic-ai/sdk';
import { tryCatch, type Result } from '../../shared/Result.js';
import type {
  ILlmGateway,
  LlmMessage,
  LlmOptions,
  LlmResponse,
} from '../../application/ports/ILlmGateway.js';

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
      const tools = options.tools?.map(tool => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema as Anthropic.Tool['input_schema'],
      }));

      const request: Anthropic.MessageCreateParamsNonStreaming = {
        model: this.model,
        max_tokens: options.maxTokens ?? 1024,
        messages: messages.map(message => ({
          role: message.role === 'system' ? 'user' : message.role,
          content: message.content,
        })) as Anthropic.MessageParam[],
      };

      if (options.systemPrompt) {
        request.system = options.systemPrompt;
      }

      if (tools && tools.length > 0) {
        request.tools = tools;
      }

      if (options.temperature !== undefined) {
        request.temperature = options.temperature;
      }

      const response = await this.client.messages.create(request);

      const textContent = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map(block => block.text)
        .join('');

      const toolCalls = response.content
        .filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use')
        .map(block => ({
          toolName: block.name,
          toolInput: block.input as Record<string, unknown>,
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
