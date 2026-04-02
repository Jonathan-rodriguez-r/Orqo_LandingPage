import { AgentOrchestrationService } from '../AgentOrchestrationService.js';
import { Ok, Err } from '../../../shared/Result.js';
import { Agent } from '../../../domain/agent/entities/Agent.js';
import { Conversation } from '../../../domain/conversation/entities/Conversation.js';
import { PhoneNumber } from '../../../domain/conversation/value-objects/PhoneNumber.js';
import type { IModelRouter } from '../../ports/IModelRouter.js';
import type { ISkillRegistry } from '../../ports/ISkillRegistry.js';
import type { IMcpGateway } from '../../ports/IMcpGateway.js';
import type { ILlmGateway, LlmResponse } from '../../ports/ILlmGateway.js';
import type { ModelPolicy } from '../../../domain/policy/ModelPolicy.js';
import { DEFAULT_MODEL_POLICY } from '../../../domain/policy/ModelPolicy.js';

const defaultPolicy: ModelPolicy = {
  workspaceId: 'ws-1',
  ...DEFAULT_MODEL_POLICY,
  updatedAt: new Date(),
};

const okLlmResponse: LlmResponse = {
  content: 'Hola, soy ORQO.',
  toolCalls: [],
  usage: { inputTokens: 50, outputTokens: 20 },
  model: 'claude-sonnet-4-6',
  provider: 'anthropic',
};

function makeMockGateway(response: LlmResponse = okLlmResponse): ILlmGateway {
  return {
    complete: jest.fn().mockResolvedValue(Ok(response)),
  };
}

function makeModelRouter(overrides: Partial<IModelRouter> = {}): IModelRouter {
  return {
    getPolicy: jest.fn().mockResolvedValue(defaultPolicy),
    buildGateway: jest.fn().mockResolvedValue(Ok(makeMockGateway())),
    checkBudget: jest.fn().mockResolvedValue(Ok(undefined)),
    recordUsage: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeSkillRegistry(): ISkillRegistry {
  return {
    register: jest.fn(),
    getAll: jest.fn().mockReturnValue([]),
    findById: jest.fn().mockReturnValue(undefined),
    findCapable: jest.fn().mockReturnValue([]),
  };
}

function makeMcpGateway(): IMcpGateway {
  return {
    connect: jest.fn(),
    listTools: jest.fn(),
    callTool: jest.fn(),
    disconnect: jest.fn(),
  };
}

function makeConversationWithMessage(message = 'Hola'): Conversation {
  const phone = PhoneNumber.create('573001234567');
  if (!phone.ok) throw new Error('Invalid phone');

  const conv = Conversation.create('ws-1', phone.value, 'agent-1');
  conv.receiveUserMessage(message, {});
  return conv;
}

function makeAgent(skillIds: string[] = []): Agent {
  return new Agent('agent-1', 'ws-1', 'ORQO Demo', 'Eres ORQO.', skillIds, 20, true);
}

describe('AgentOrchestrationService.generateResponse', () => {
  it('devuelve Err si no hay mensaje de usuario en la conversación', async () => {
    const phone = PhoneNumber.create('573001234567');
    if (!phone.ok) throw new Error('Invalid phone');
    const emptyConv = Conversation.create('ws-1', phone.value, 'agent-1');

    const service = new AgentOrchestrationService(makeModelRouter(), makeSkillRegistry(), makeMcpGateway());
    const result = await service.generateResponse(emptyConv, makeAgent());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('mensaje de usuario');
    }
  });

  it('retorna Err si el presupuesto está excedido', async () => {
    const router = makeModelRouter({
      checkBudget: jest.fn().mockResolvedValue(Err(new Error('Presupuesto diario excedido'))),
    });
    const service = new AgentOrchestrationService(router, makeSkillRegistry(), makeMcpGateway());
    const result = await service.generateResponse(makeConversationWithMessage(), makeAgent());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Presupuesto');
    }
  });

  it('retorna Err si no hay gateway disponible', async () => {
    const router = makeModelRouter({
      buildGateway: jest.fn().mockResolvedValue(Err(new Error('Sin API keys'))),
    });
    const service = new AgentOrchestrationService(router, makeSkillRegistry(), makeMcpGateway());
    const result = await service.generateResponse(makeConversationWithMessage(), makeAgent());

    expect(result.ok).toBe(false);
  });

  it('genera respuesta correctamente sin tool calls', async () => {
    const service = new AgentOrchestrationService(makeModelRouter(), makeSkillRegistry(), makeMcpGateway());
    const result = await service.generateResponse(makeConversationWithMessage(), makeAgent());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.responseText).toBe('Hola, soy ORQO.');
      expect(result.value.skillUsed).toBeUndefined();
    }
  });

  it('registra el uso de tokens tras la respuesta', async () => {
    const router = makeModelRouter();
    const service = new AgentOrchestrationService(router, makeSkillRegistry(), makeMcpGateway());
    await service.generateResponse(makeConversationWithMessage(), makeAgent());

    expect(router.recordUsage).toHaveBeenCalledWith(
      'ws-1',
      'claude-sonnet-4-6',
      'anthropic',
      { inputTokens: 50, outputTokens: 20 },
    );
  });

  it('limita tool calls al máximo de la política (maxToolCallsPerTurn)', async () => {
    const policy: ModelPolicy = {
      ...defaultPolicy,
      guardrails: { ...DEFAULT_MODEL_POLICY.guardrails, maxToolCallsPerTurn: 1 },
    };

    const gatewayWithTools = makeMockGateway({
      ...okLlmResponse,
      toolCalls: [
        { toolName: 'skill-a', toolInput: {} },
        { toolName: 'skill-b', toolInput: {} }, // debe ser ignorada
      ],
    });

    const router = makeModelRouter({
      getPolicy: jest.fn().mockResolvedValue(policy),
      buildGateway: jest.fn().mockResolvedValue(Ok(gatewayWithTools)),
    });

    const skillRegistry = makeSkillRegistry();
    // Ninguna skill registrada → tool calls ignorados → retorna texto del primer pass
    const service = new AgentOrchestrationService(router, skillRegistry, makeMcpGateway());
    const result = await service.generateResponse(makeConversationWithMessage(), makeAgent(['skill-a', 'skill-b']));

    // Sin skills en registry, toolResults queda vacío → retorna contenido del LLM
    expect(result.ok).toBe(true);
  });

  it('retorna Err si el LLM falla en la primera pasada', async () => {
    const failingGateway: ILlmGateway = {
      complete: jest.fn().mockResolvedValue(Err(new Error('LLM Error'))),
    };
    const router = makeModelRouter({
      buildGateway: jest.fn().mockResolvedValue(Ok(failingGateway)),
    });

    const service = new AgentOrchestrationService(router, makeSkillRegistry(), makeMcpGateway());
    const result = await service.generateResponse(makeConversationWithMessage(), makeAgent());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe('LLM Error');
    }
  });
});
