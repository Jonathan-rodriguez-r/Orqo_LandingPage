import { Ok, Err, tryCatch, type Result } from '../../shared/Result.js';
import type { Conversation } from '../../domain/conversation/entities/Conversation.js';
import type { Agent } from '../../domain/agent/entities/Agent.js';
import type { SkillContext } from '../../domain/skill/ISkill.js';
import type { ISkillRegistry } from '../ports/ISkillRegistry.js';
import type { LlmOptions, LlmTool } from '../ports/ILlmGateway.js';
import type { IMcpGateway } from '../ports/IMcpGateway.js';
import type { IModelRouter } from '../ports/IModelRouter.js';
import type { ILogger } from '../../shared/Logger.js';
import { NoopLogger } from '../../shared/Logger.js';
import { MetricsRegistry } from '../../shared/Metrics.js';

export interface OrchestrationResult {
  responseText: string;
  skillUsed?: string;
}

/**
 * Ejecuta una promesa con timeout.
 * Lanza Error si el timeout se supera antes de que la promesa resuelva.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout en tool '${label}' (${ms}ms)`)), ms),
    ),
  ]);
}

export class AgentOrchestrationService {
  private readonly llmCalls;
  private readonly llmLatency;
  private readonly toolCalls;
  private readonly budgetExceeded;

  constructor(
    private readonly modelRouter: IModelRouter,
    private readonly skillRegistry: ISkillRegistry,
    private readonly mcpGateway: IMcpGateway,
    private readonly logger: ILogger = new NoopLogger(),
  ) {
    const metrics = MetricsRegistry.default;
    this.llmCalls = metrics.counter(
      'orqo_llm_calls_total',
      'Total de llamadas al LLM',
      ['model', 'provider', 'pass'],
    );
    this.llmLatency = metrics.histogram(
      'orqo_llm_latency_seconds',
      'Latencia de llamadas al LLM en segundos',
      ['model', 'provider', 'pass'],
      [0.1, 0.25, 0.5, 1, 2, 5, 10, 30],
    );
    this.toolCalls = metrics.counter(
      'orqo_tool_calls_total',
      'Total de tool calls ejecutadas',
      ['tool', 'status'],
    );
    this.budgetExceeded = metrics.counter(
      'orqo_budget_exceeded_total',
      'Total de requests rechazados por presupuesto excedido',
      ['workspace'],
    );
  }

  async generateResponse(
    conversation: Conversation,
    agent: Agent,
  ): Promise<Result<OrchestrationResult>> {
    const lastUserMessage = [...conversation.messages]
      .reverse()
      .find(message => message.role === 'user');

    if (!lastUserMessage) {
      return Err(new Error('No hay mensaje de usuario en la conversacion'));
    }

    // ── Hito 3: presupuesto, política y gateway ───────────────────────────────

    const budgetResult = await this.modelRouter.checkBudget(conversation.workspaceId);
    if (!budgetResult.ok) {
      this.budgetExceeded.inc({ workspace: conversation.workspaceId });
      this.logger.warn('Presupuesto excedido — request rechazado', {
        workspaceId: conversation.workspaceId,
        error: budgetResult.error.message,
      });
      return Err(budgetResult.error);
    }

    const policy = await this.modelRouter.getPolicy(conversation.workspaceId);
    const { maxToolCallsPerTurn, toolTimeoutMs } = policy.guardrails;

    const gatewayResult = await this.modelRouter.buildGateway(conversation.workspaceId);
    if (!gatewayResult.ok) {
      return Err(gatewayResult.error);
    }
    const llmGateway = gatewayResult.value;

    // ── Contexto y skills disponibles ────────────────────────────────────────

    const context: SkillContext = {
      conversationId: conversation.id,
      workspaceId: conversation.workspaceId,
      message: lastUserMessage.content,
      history: conversation.getRecentHistory(10),
      toolInput: {},
    };

    const capableSkills = this.skillRegistry
      .findCapable(context)
      .filter(skill => agent.canUseSkill(skill.manifest.id));

    const tools: LlmTool[] = capableSkills.map(skill => ({
      name: skill.manifest.id,
      description: skill.manifest.description,
      inputSchema: skill.manifest.inputSchema ?? { type: 'object', properties: {} },
    }));

    // ── Primera pasada LLM ───────────────────────────────────────────────────

    const firstPassOptions: LlmOptions = {
      systemPrompt: agent.systemPrompt,
      maxTokens: policy.primary.maxTokens ?? 1_024,
    };
    if (tools.length > 0) {
      firstPassOptions.tools = tools;
    }

    const t0First = Date.now();
    const llmResult = await llmGateway.complete(
      context.history.map(historyItem => ({
        role: historyItem.role,
        content: historyItem.content,
      })),
      firstPassOptions,
    );
    const firstLatency = (Date.now() - t0First) / 1000;

    if (!llmResult.ok) {
      this.logger.error('Error en primera pasada del LLM', { error: llmResult.error.message });
      return Err(llmResult.error);
    }

    const llmResponse = llmResult.value;

    // Métricas de la primera pasada
    this.llmCalls.inc({ model: llmResponse.model, provider: llmResponse.provider, pass: 'first' });
    this.llmLatency.observe({ model: llmResponse.model, provider: llmResponse.provider, pass: 'first' }, firstLatency);

    // Registrar uso de la primera pasada (best-effort)
    await this.modelRouter.recordUsage(
      conversation.workspaceId,
      llmResponse.model,
      llmResponse.provider,
      llmResponse.usage,
    );

    this.logger.debug('Primera pasada LLM completada', {
      model: llmResponse.model,
      provider: llmResponse.provider,
      latencyMs: Math.round(firstLatency * 1000),
      toolCallsCount: llmResponse.toolCalls.length,
      inputTokens: llmResponse.usage.inputTokens,
      outputTokens: llmResponse.usage.outputTokens,
    });

    if (llmResponse.toolCalls.length === 0) {
      return Ok({ responseText: llmResponse.content });
    }

    // ── Ejecución de tools con guardrails ────────────────────────────────────

    // Limitar tool calls por turno según política del workspace
    const allowedToolCalls = llmResponse.toolCalls.slice(0, maxToolCallsPerTurn);

    const toolResults: Array<{ name: string; result: string }> = [];
    let primarySkillUsed: string | undefined;

    for (const toolCall of allowedToolCalls) {
      const skill = this.skillRegistry.findById(toolCall.toolName);
      if (!skill) {
        continue;
      }

      primarySkillUsed ??= skill.manifest.id;

      if (skill.manifest.mcpServer) {
        const sessionResult = await this.mcpGateway.connect(skill.manifest.mcpServer);
        if (!sessionResult.ok) {
          toolResults.push({
            name: toolCall.toolName,
            result: '[Error: no se pudo conectar al servidor MCP]',
          });
          continue;
        }

        const session = sessionResult.value;
        const mcpResult = await tryCatch(() =>
          withTimeout(
            this.mcpGateway.callTool(session, toolCall.toolName, toolCall.toolInput),
            toolTimeoutMs,
            toolCall.toolName,
          ),
        );
        await this.mcpGateway.disconnect(session);

        if (!mcpResult.ok) {
          this.toolCalls.inc({ tool: toolCall.toolName, status: 'error' });
          this.logger.warn('Tool MCP falló', { tool: toolCall.toolName, error: mcpResult.error.message });
          toolResults.push({
            name: toolCall.toolName,
            result: `[Error en MCP: ${mcpResult.error.message}]`,
          });
        } else if (!mcpResult.value.ok) {
          this.toolCalls.inc({ tool: toolCall.toolName, status: 'error' });
          this.logger.warn('Tool MCP retornó error', { tool: toolCall.toolName, error: mcpResult.value.error.message });
          toolResults.push({
            name: toolCall.toolName,
            result: `[Error en MCP: ${mcpResult.value.error.message}]`,
          });
        } else {
          this.toolCalls.inc({ tool: toolCall.toolName, status: 'success' });
          const text = mcpResult.value.value.content
            .map(contentBlock => contentBlock.text ?? '')
            .filter(Boolean)
            .join('\n');
          toolResults.push({ name: toolCall.toolName, result: text });
        }
        continue;
      }

      const skillResult = await tryCatch(() =>
        withTimeout(
          skill.execute({ ...context, toolInput: toolCall.toolInput }),
          toolTimeoutMs,
          toolCall.toolName,
        ),
      );

      if (!skillResult.ok) {
        const isTimeout = skillResult.error.message.includes('Timeout');
        this.toolCalls.inc({ tool: toolCall.toolName, status: isTimeout ? 'timeout' : 'error' });
        this.logger.warn('Skill falló', { tool: toolCall.toolName, error: skillResult.error.message });
        toolResults.push({
          name: toolCall.toolName,
          result: `[Error en skill: ${skillResult.error.message}]`,
        });
      } else if (!skillResult.value.ok) {
        this.toolCalls.inc({ tool: toolCall.toolName, status: 'error' });
        this.logger.warn('Skill retornó error', { tool: toolCall.toolName, error: skillResult.value.error.message });
        toolResults.push({
          name: toolCall.toolName,
          result: `[Error en skill: ${skillResult.value.error.message}]`,
        });
      } else {
        this.toolCalls.inc({ tool: toolCall.toolName, status: 'success' });
        toolResults.push({
          name: toolCall.toolName,
          result: skillResult.value.value.content,
        });
      }
    }

    if (toolResults.length === 0) {
      return Ok({ responseText: llmResponse.content });
    }

    // ── Segunda pasada LLM — síntesis ────────────────────────────────────────

    const toolResultsText = toolResults
      .map(result => `[${result.name}]\n${result.result}`)
      .join('\n\n');

    const t0Synthesis = Date.now();
    const synthesisResult = await llmGateway.complete(
      [
        ...context.history.map(historyItem => ({
          role: historyItem.role,
          content: historyItem.content,
        })),
        {
          role: 'user',
          content: `Resultados de las herramientas:\n\n${toolResultsText}\n\nResponde al usuario basandote en estos datos.`,
        },
      ],
      {
        systemPrompt: agent.systemPrompt,
        maxTokens: policy.primary.maxTokens ?? 1_024,
      },
    );
    const synthesisLatency = (Date.now() - t0Synthesis) / 1000;

    if (!synthesisResult.ok) {
      this.logger.error('Error en síntesis LLM', { error: synthesisResult.error.message });
      return Err(synthesisResult.error);
    }

    // Métricas de la síntesis
    this.llmCalls.inc({ model: synthesisResult.value.model, provider: synthesisResult.value.provider, pass: 'synthesis' });
    this.llmLatency.observe({ model: synthesisResult.value.model, provider: synthesisResult.value.provider, pass: 'synthesis' }, synthesisLatency);

    // Registrar uso de la síntesis (best-effort)
    await this.modelRouter.recordUsage(
      conversation.workspaceId,
      synthesisResult.value.model,
      synthesisResult.value.provider,
      synthesisResult.value.usage,
    );

    this.logger.debug('Síntesis LLM completada', {
      model: synthesisResult.value.model,
      latencyMs: Math.round(synthesisLatency * 1000),
      skillUsed: primarySkillUsed,
    });

    return Ok({
      responseText: synthesisResult.value.content,
      ...(primarySkillUsed ? { skillUsed: primarySkillUsed } : {}),
    });
  }
}
