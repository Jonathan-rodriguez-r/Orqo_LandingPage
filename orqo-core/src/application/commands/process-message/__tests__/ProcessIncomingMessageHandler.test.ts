import { ProcessIncomingMessageHandler } from '../ProcessIncomingMessageHandler.js';
import { createProcessIncomingMessageCommand } from '../ProcessIncomingMessageCommand.js';
import type { IConversationRepository } from '../../../../domain/conversation/repositories/IConversationRepository.js';
import type { IAgentRepository } from '../../../ports/IAgentRepository.js';
import type { IWhatsAppGateway } from '../../../ports/IWhatsAppGateway.js';
import type { IEventBus } from '../../../../shared/EventBus.js';
import type { AgentOrchestrationService } from '../../../services/AgentOrchestrationService.js';
import { Agent } from '../../../../domain/agent/entities/Agent.js';
import { Ok, Err } from '../../../../shared/Result.js';

// ── Helpers de mock ───────────────────────────────────────────────────────────

function makeConversationRepo(
  overrides: Partial<IConversationRepository> = {},
): IConversationRepository {
  return {
    findById: jest.fn().mockResolvedValue(null),
    findByPhone: jest.fn().mockResolvedValue(null),
    save: jest.fn().mockResolvedValue(undefined),
    findRecent: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function makeAgentRepo(agent?: Agent): IAgentRepository {
  return {
    findById: jest.fn().mockResolvedValue(agent ?? null),
    findActiveByWorkspace: jest.fn().mockResolvedValue(
      agent ?? new Agent('agent-1', 'ws-1', 'ORQO Demo', 'Eres ORQO.', ['support-faq'], 20, true),
    ),
    save: jest.fn().mockResolvedValue(undefined),
  };
}

function makeOrchestration(
  response = 'Hola, soy ORQO.',
): Pick<AgentOrchestrationService, 'generateResponse'> {
  return {
    generateResponse: jest.fn().mockResolvedValue(
      Ok({ responseText: response, skillUsed: undefined }),
    ),
  } as any;
}

function makeWhatsAppGateway(): IWhatsAppGateway {
  return {
    sendMessage: jest.fn().mockResolvedValue(Ok({ messageId: 'wamid.123', status: 'sent' })),
    markAsRead: jest.fn().mockResolvedValue(undefined),
  };
}

function makeEventBus(): IEventBus {
  return {
    publish: jest.fn().mockResolvedValue(undefined),
    publishAll: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ProcessIncomingMessageHandler', () => {
  it('retorna Ok con el messageId cuando todo es exitoso', async () => {
    const handler = new ProcessIncomingMessageHandler(
      makeConversationRepo(),
      makeAgentRepo(),
      makeOrchestration() as any,
      makeWhatsAppGateway(),
      makeEventBus(),
    );

    const cmd = createProcessIncomingMessageCommand(
      'ws-1',
      '573001234567',
      'Hola, ¿cuál es el estado de mi pedido?',
      'wamid.incoming.abc',
    );

    const result = await handler.handle(cmd);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('wamid.123');
  });

  it('retorna Err si el número de teléfono es inválido', async () => {
    const handler = new ProcessIncomingMessageHandler(
      makeConversationRepo(),
      makeAgentRepo(),
      makeOrchestration() as any,
      makeWhatsAppGateway(),
      makeEventBus(),
    );

    const cmd = createProcessIncomingMessageCommand('ws-1', 'no-es-numero', 'Hola', 'wamid.x');
    const result = await handler.handle(cmd);

    expect(result.ok).toBe(false);
  });

  it('retorna Err si no hay agente activo en el workspace', async () => {
    const agentRepo: IAgentRepository = {
      findById: jest.fn().mockResolvedValue(null),
      findActiveByWorkspace: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
    };

    const handler = new ProcessIncomingMessageHandler(
      makeConversationRepo(),
      agentRepo,
      makeOrchestration() as any,
      makeWhatsAppGateway(),
      makeEventBus(),
    );

    const cmd = createProcessIncomingMessageCommand('ws-sin-agente', '573001234567', 'Hola', 'wamid.x');
    const result = await handler.handle(cmd);

    expect(result.ok).toBe(false);
  });

  it('persiste la conversación aunque falle el envío por WhatsApp', async () => {
    const conversationRepo = makeConversationRepo();
    const waGateway: IWhatsAppGateway = {
      sendMessage: jest.fn().mockResolvedValue(Err(new Error('WA timeout'))),
      markAsRead: jest.fn(),
    };

    const handler = new ProcessIncomingMessageHandler(
      conversationRepo,
      makeAgentRepo(),
      makeOrchestration() as any,
      waGateway,
      makeEventBus(),
    );

    const cmd = createProcessIncomingMessageCommand('ws-1', '573001234567', 'Test', 'wamid.x');
    const result = await handler.handle(cmd);

    expect(result.ok).toBe(false);
    // La conversación debe haberse guardado aunque WA falle
    expect(conversationRepo.save).toHaveBeenCalled();
  });

  it('publica domain events después de procesar el mensaje', async () => {
    const eventBus = makeEventBus();

    const handler = new ProcessIncomingMessageHandler(
      makeConversationRepo(),
      makeAgentRepo(),
      makeOrchestration() as any,
      makeWhatsAppGateway(),
      eventBus,
    );

    const cmd = createProcessIncomingMessageCommand('ws-1', '573001234567', 'Hola', 'wamid.x');
    await handler.handle(cmd);

    expect(eventBus.publishAll).toHaveBeenCalled();
  });
});
