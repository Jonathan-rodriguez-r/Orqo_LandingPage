import { ProcessIncomingMessageHandler } from '../ProcessIncomingMessageHandler.js';
import { createProcessIncomingMessageCommand } from '../ProcessIncomingMessageCommand.js';
import type { IConversationRepository } from '../../../../domain/conversation/repositories/IConversationRepository.js';
import type { IAgentRepository } from '../../../ports/IAgentRepository.js';
import type { IOutboundGateway } from '../../../ports/IOutboundGateway.js';
import type { IEventBus } from '../../../../shared/EventBus.js';
import type { AgentOrchestrationService } from '../../../services/AgentOrchestrationService.js';
import { Agent } from '../../../../domain/agent/entities/Agent.js';
import { Ok, Err } from '../../../../shared/Result.js';
import type { IConversationLockManager } from '../../../ports/IConversationLockManager.js';
import type { IConversationSnapshotRepository } from '../../../ports/IConversationSnapshotRepository.js';
import type { IConversationAuditRepository } from '../../../ports/IConversationAuditRepository.js';
import type { IOutboundMessageOutbox } from '../../../ports/IOutboundMessageOutbox.js';

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
      Ok({ responseText: response }),
    ),
  } as any;
}

function makeOutboundGateway(): IOutboundGateway {
  return {
    sendTextMessage: jest.fn().mockResolvedValue(Ok({ messageId: 'wamid.123', status: 'sent' })),
    markAsRead: jest.fn().mockResolvedValue(undefined),
    canHandle: jest.fn().mockReturnValue(true),
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

function makeLockManager(): IConversationLockManager {
  return {
    acquire: jest.fn().mockResolvedValue(
      Ok({
        lockId: 'lock-1',
        ownerId: 'owner-1',
        workspaceId: 'ws-1',
        key: 'sender:573001234567',
        expiresAt: new Date('2026-03-31T22:00:00.000Z'),
      }),
    ),
    release: jest.fn().mockResolvedValue(undefined),
  };
}

function makeSnapshotRepository(): IConversationSnapshotRepository {
  return {
    save: jest.fn().mockResolvedValue(undefined),
  };
}

function makeAuditRepository(): IConversationAuditRepository {
  return {
    append: jest.fn().mockResolvedValue(undefined),
  };
}

function makeOutboundMessageOutbox(): IOutboundMessageOutbox {
  return {
    createPending: jest.fn().mockResolvedValue('outbox-1'),
    markSent: jest.fn().mockResolvedValue(undefined),
    markFailed: jest.fn().mockResolvedValue(undefined),
  };
}

describe('ProcessIncomingMessageHandler', () => {
  it('retorna Ok con el messageId cuando todo es exitoso', async () => {
    const handler = new ProcessIncomingMessageHandler(
      makeConversationRepo(),
      makeAgentRepo(),
      makeOrchestration() as any,
      makeOutboundGateway(),
      makeEventBus(),
      makeLockManager(),
      makeSnapshotRepository(),
      makeAuditRepository(),
      makeOutboundMessageOutbox(),
    );

    const cmd = createProcessIncomingMessageCommand(
      'ws-1',
      'whatsapp',
      '573001234567',
      'Hola, cual es el estado de mi pedido?',
      'wamid.incoming.abc',
    );

    const result = await handler.handle(cmd);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe('wamid.123');
    }
  });

  it('retorna Err si el senderExternalId es invalido', async () => {
    const handler = new ProcessIncomingMessageHandler(
      makeConversationRepo(),
      makeAgentRepo(),
      makeOrchestration() as any,
      makeOutboundGateway(),
      makeEventBus(),
      makeLockManager(),
      makeSnapshotRepository(),
      makeAuditRepository(),
      makeOutboundMessageOutbox(),
    );

    const cmd = createProcessIncomingMessageCommand('ws-1', 'whatsapp', 'no-es-numero', 'Hola', 'wamid.x');
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
      makeOutboundGateway(),
      makeEventBus(),
      makeLockManager(),
      makeSnapshotRepository(),
      makeAuditRepository(),
      makeOutboundMessageOutbox(),
    );

    const cmd = createProcessIncomingMessageCommand('ws-sin-agente', 'whatsapp', '573001234567', 'Hola', 'wamid.x');
    const result = await handler.handle(cmd);

    expect(result.ok).toBe(false);
  });

  it('marca el outbox como fallido si falla el envio por el gateway', async () => {
    const conversationRepo = makeConversationRepo();
    const outbox = makeOutboundMessageOutbox();
    const gateway: IOutboundGateway = {
      sendTextMessage: jest.fn().mockResolvedValue(Err(new Error('Gateway timeout'))),
      markAsRead: jest.fn(),
      canHandle: jest.fn().mockReturnValue(true),
    };

    const handler = new ProcessIncomingMessageHandler(
      conversationRepo,
      makeAgentRepo(),
      makeOrchestration() as any,
      gateway,
      makeEventBus(),
      makeLockManager(),
      makeSnapshotRepository(),
      makeAuditRepository(),
      outbox,
    );

    const cmd = createProcessIncomingMessageCommand('ws-1', 'whatsapp', '573001234567', 'Test', 'wamid.x');
    const result = await handler.handle(cmd);

    expect(result.ok).toBe(false);
    expect(conversationRepo.save).toHaveBeenCalled();
    expect(outbox.markFailed).toHaveBeenCalledWith('outbox-1', 'Gateway timeout');
  });

  it('publica eventos, guarda snapshot y registra outbox cuando procesa el mensaje', async () => {
    const eventBus = makeEventBus();
    const snapshotRepository = makeSnapshotRepository();
    const auditRepository = makeAuditRepository();
    const outbox = makeOutboundMessageOutbox();
    const lockManager = makeLockManager();

    const handler = new ProcessIncomingMessageHandler(
      makeConversationRepo(),
      makeAgentRepo(),
      makeOrchestration() as any,
      makeOutboundGateway(),
      eventBus,
      lockManager,
      snapshotRepository,
      auditRepository,
      outbox,
    );

    const cmd = createProcessIncomingMessageCommand('ws-1', 'whatsapp', '573001234567', 'Hola', 'wamid.x');
    await handler.handle(cmd);

    expect(outbox.createPending).toHaveBeenCalled();
    expect(outbox.markSent).toHaveBeenCalledWith('outbox-1', 'wamid.123');
    expect(auditRepository.append).toHaveBeenCalled();
    expect(eventBus.publishAll).toHaveBeenCalled();
    expect(snapshotRepository.save).toHaveBeenCalled();
    expect(lockManager.release).toHaveBeenCalled();
  });
});
