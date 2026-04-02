import { tryCatch, type Result } from '../../shared/Result.js';
import type {
  ILlmGateway,
  LlmMessage,
  LlmOptions,
  LlmResponse,
} from '../../application/ports/ILlmGateway.js';

/** Tipos mínimos del API de OpenAI (sin SDK externo). */
interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | null;
  tool_calls?: OpenAIToolCall[];
}

interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface OpenAIFunction {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

interface OpenAITool {
  type: 'function';
  function: OpenAIFunction;
}

interface OpenAIRequest {
  model: string;
  messages: OpenAIMessage[];
  max_tokens?: number;
  temperature?: number;
  tools?: OpenAITool[];
  tool_choice?: 'auto' | 'none';
}

interface OpenAIResponse {
  choices: Array<{
    message: OpenAIMessage;
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
  };
  model: string;
}

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

export class OpenAILlmGateway implements ILlmGateway {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(
    apiKey = process.env['OPENAI_API_KEY'] ?? '',
    model = 'gpt-4o',
  ) {
    this.apiKey = apiKey;
    this.model = model;
  }

  async complete(
    messages: LlmMessage[],
    options: LlmOptions = {},
  ): Promise<Result<LlmResponse>> {
    return tryCatch(async () => {
      const openaiMessages: OpenAIMessage[] = messages.map(msg => ({
        role: msg.role === 'system' ? 'system' : msg.role,
        content: msg.content,
      }));

      if (options.systemPrompt) {
        openaiMessages.unshift({ role: 'system', content: options.systemPrompt });
      }

      const body: OpenAIRequest = {
        model: this.model,
        messages: openaiMessages,
        max_tokens: options.maxTokens ?? 1_024,
      };

      if (options.temperature !== undefined) {
        body.temperature = options.temperature;
      }

      if (options.tools && options.tools.length > 0) {
        body.tools = options.tools.map(tool => ({
          type: 'function' as const,
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema,
          },
        }));
        body.tool_choice = 'auto';
      }

      const res = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`OpenAI API error ${res.status}: ${errText}`);
      }

      const data = (await res.json()) as OpenAIResponse;
      const choice = data.choices[0];
      if (!choice) {
        throw new Error('OpenAI devolvió una respuesta vacía (sin choices)');
      }

      const message = choice.message;
      const content = message.content ?? '';

      const toolCalls = (message.tool_calls ?? []).map(tc => ({
        toolName: tc.function.name,
        toolInput: JSON.parse(tc.function.arguments) as Record<string, unknown>,
      }));

      return {
        content,
        toolCalls,
        usage: {
          inputTokens: data.usage.prompt_tokens,
          outputTokens: data.usage.completion_tokens,
        },
        model: data.model,
        provider: 'openai',
      } satisfies LlmResponse;
    });
  }
}
