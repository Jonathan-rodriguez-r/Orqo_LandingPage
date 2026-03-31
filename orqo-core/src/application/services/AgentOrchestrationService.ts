import { Ok, Err, type Result } from '../../shared/Result.js';
import type { Conversation } from '../../domain/conversation/entities/Conversation.js';
import type { Agent } from '../../domain/agent/entities/Agent.js';
import type { SkillContext } from '../../domain/skill/ISkill.js';
import type { ISkillRegistry } from '../ports/ISkillRegistry.js';
import type { ILlmGateway, LlmTool } from '../ports/ILlmGateway.js';
import type { IMcpGateway } from '../ports/IMcpGateway.js';

export interface OrchestrationResult {
  responseText: string;
  skillUsed?: string;
}

/**
 * ─── AgentOrchestrationService ──────────────────────────────────────────────
 *
 * Cerebro del sistema. Implementa el loop de razonamiento:
 *
 *   User message
 *      │
 *      ▼
 *   Pre-filtrar Skills con SkillRegistry.findCapable()
 *      │
 *      ▼
 *   Construir toolset → llamar LLM con historial + tools
 *      │
 *      ├── No tool calls → devolver respuesta directa del LLM
 *      │
 *      └── Tool calls →
 *            ├── Skill con mcpServer → McpGateway.callTool()
 *            └── Skill pura        → skill.execute()
 *                   │
 *                   ▼
 *              Síntesis final del LLM con resultados de tools
 */
export class AgentOrchestrationService {
  constructor(
    private readonly llmGateway: ILlmGateway,
    private readonly skillRegistry: ISkillRegistry,
    private readonly mcpGateway: IMcpGateway,
  ) {}

  async generateResponse(
    conversation: Conversation,
    agent: Agent,
  ): Promise<Result<OrchestrationResult>> {
    const lastUserMessage = [...conversation.messages]
      .reverse()
      .find(m => m.role === 'user');

    if (!lastUserMessage) {
      return Err(new Error('No hay mensaje de usuario en la conversación'));
    }

    // ── 1. Construir contexto para las Skills ────────────────────────────
    const context: SkillContext = {
      conversationId: conversation.id,
      workspaceId: conversation.workspaceId,
      message: lastUserMessage.content,
      history: conversation.getRecentHistory(10),
      toolInput: {},
    };

    // ── 2. Pre-filtrar Skills habilitadas para este agente ───────────────
    const capableSkills = this.skillRegistry
      .findCapable(context)
      .filter(skill => agent.canUseSkill(skill.manifest.id));

    // ── 3. Construir tools para el LLM ────────────────────────────────────
    const tools: LlmTool[] = capableSkills.map(skill => ({
      name: skill.manifest.id,
      description: skill.manifest.description,
      inputSchema: skill.manifest.inputSchema ?? { type: 'object', properties: {} },
    }));

    // ── 4. Primera llamada al LLM ─────────────────────────────────────────
    const llmResult = await this.llmGateway.complete(
      context.history.map(h => ({ role: h.role, content: h.content })),
      {
        systemPrompt: agent.systemPrompt,
        tools: tools.length > 0 ? tools : undefined,
        maxTokens: 1024,
      },
    );

    if (!llmResult.ok) return Err(llmResult.error);

    const llmResponse = llmResult.value;

    // ── 5. Sin tool calls → respuesta directa ────────────────────────────
    if (llmResponse.toolCalls.length === 0) {
      return Ok({ responseText: llmResponse.content });
    }

    // ── 6. Ejecutar tools seleccionadas por el LLM ────────────────────────
    const toolResults: Array<{ name: string; result: string }> = [];
    let primarySkillUsed: string | undefined;

    for (const toolCall of llmResponse.toolCalls) {
      const skill = this.skillRegistry.findById(toolCall.toolName);
      if (!skill) continue;

      primarySkillUsed ??= skill.manifest.id;

      if (skill.manifest.mcpServer) {
        // ── 6a. Skill respaldada por MCP ──────────────────────────────────
        const sessionResult = await this.mcpGateway.connect(skill.manifest.mcpServer);
        if (!sessionResult.ok) {
          toolResults.push({ name: toolCall.toolName, result: '[Error: no se pudo conectar al servidor MCP]' });
          continue;
        }

        const session = sessionResult.value;
        const mcpResult = await this.mcpGateway.callTool(
          session,
          toolCall.toolName,
          toolCall.toolInput,
        );
        await this.mcpGateway.disconnect(session);

        if (mcpResult.ok) {
          const text = mcpResult.value.content
            .map(c => c.text ?? '')
            .filter(Boolean)
            .join('\n');
          toolResults.push({ name: toolCall.toolName, result: text });
        }
      } else {
        // ── 6b. Skill pura (lógica TypeScript directa) ────────────────────
        const skillResult = await skill.execute({
          ...context,
          toolInput: toolCall.toolInput,
        });

        if (skillResult.ok) {
          toolResults.push({ name: toolCall.toolName, result: skillResult.value.content });
        }
      }
    }

    if (toolResults.length === 0) {
      return Ok({ responseText: llmResponse.content });
    }

    // ── 7. Segunda llamada al LLM: síntesis con los resultados de tools ───
    const toolResultsText = toolResults
      .map(r => `[${r.name}]\n${r.result}`)
      .join('\n\n');

    const synthesisResult = await this.llmGateway.complete(
      [
        ...context.history.map(h => ({ role: h.role, content: h.content })),
        {
          role: 'user',
          content: `Resultados de las herramientas:\n\n${toolResultsText}\n\nResponde al usuario basándote en estos datos.`,
        },
      ],
      {
        systemPrompt: agent.systemPrompt,
        maxTokens: 1024,
      },
    );

    if (!synthesisResult.ok) return Err(synthesisResult.error);

    return Ok({
      responseText: synthesisResult.value.content,
      skillUsed: primarySkillUsed,
    });
  }
}
