import { Ok, Err, type Result } from '../../shared/Result.js';
import type { Conversation } from '../../domain/conversation/entities/Conversation.js';
import type { Agent } from '../../domain/agent/entities/Agent.js';
import type { SkillContext } from '../../domain/skill/ISkill.js';
import type { ISkillRegistry } from '../ports/ISkillRegistry.js';
import type { ILlmGateway, LlmOptions, LlmTool } from '../ports/ILlmGateway.js';
import type { IMcpGateway } from '../ports/IMcpGateway.js';

export interface OrchestrationResult {
  responseText: string;
  skillUsed?: string;
}

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
      .find(message => message.role === 'user');

    if (!lastUserMessage) {
      return Err(new Error('No hay mensaje de usuario en la conversacion'));
    }

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

    const firstPassOptions: LlmOptions = {
      systemPrompt: agent.systemPrompt,
      maxTokens: 1024,
    };
    if (tools.length > 0) {
      firstPassOptions.tools = tools;
    }

    const llmResult = await this.llmGateway.complete(
      context.history.map(historyItem => ({
        role: historyItem.role,
        content: historyItem.content,
      })),
      firstPassOptions,
    );

    if (!llmResult.ok) {
      return Err(llmResult.error);
    }

    const llmResponse = llmResult.value;
    if (llmResponse.toolCalls.length === 0) {
      return Ok({ responseText: llmResponse.content });
    }

    const toolResults: Array<{ name: string; result: string }> = [];
    let primarySkillUsed: string | undefined;

    for (const toolCall of llmResponse.toolCalls) {
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
        const mcpResult = await this.mcpGateway.callTool(
          session,
          toolCall.toolName,
          toolCall.toolInput,
        );
        await this.mcpGateway.disconnect(session);

        if (mcpResult.ok) {
          const text = mcpResult.value.content
            .map(contentBlock => contentBlock.text ?? '')
            .filter(Boolean)
            .join('\n');
          toolResults.push({ name: toolCall.toolName, result: text });
        }
        continue;
      }

      const skillResult = await skill.execute({
        ...context,
        toolInput: toolCall.toolInput,
      });

      if (skillResult.ok) {
        toolResults.push({
          name: toolCall.toolName,
          result: skillResult.value.content,
        });
      }
    }

    if (toolResults.length === 0) {
      return Ok({ responseText: llmResponse.content });
    }

    const toolResultsText = toolResults
      .map(result => `[${result.name}]\n${result.result}`)
      .join('\n\n');

    const synthesisResult = await this.llmGateway.complete(
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
        maxTokens: 1024,
      },
    );

    if (!synthesisResult.ok) {
      return Err(synthesisResult.error);
    }

    if (primarySkillUsed) {
      return Ok({
        responseText: synthesisResult.value.content,
        skillUsed: primarySkillUsed,
      });
    }

    return Ok({
      responseText: synthesisResult.value.content,
    });
  }
}
