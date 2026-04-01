import { MongoClient } from 'mongodb';
import { InMemoryCommandBus, type ICommandBus } from '../../shared/CommandBus.js';
import { InMemoryQueryBus, type IQueryBus } from '../../shared/QueryBus.js';
import { InMemoryEventBus, type IEventBus } from '../../shared/EventBus.js';
import { IngestInboundMessageHandler } from '../../application/commands/ingest-message/IngestInboundMessageHandler.js';
import { ProcessIncomingMessageHandler } from '../../application/commands/process-message/ProcessIncomingMessageHandler.js';
import type { IInboundMessageQueue } from '../../application/ports/IInboundMessageQueue.js';
import { AgentOrchestrationService } from '../../application/services/AgentOrchestrationService.js';
import { ClaudeLlmGateway } from '../llm/ClaudeLlmGateway.js';
import { InboundMessageWorker } from '../messaging/InboundMessageWorker.js';
import { MongoInboundMessageQueue } from '../messaging/MongoInboundMessageQueue.js';
import { MetaWhatsAppGateway } from '../messaging/MetaWhatsAppGateway.js';
import { StdioMcpGateway } from '../mcp/StdioMcpGateway.js';
import { MongoAgentRepository } from '../persistence/MongoAgentRepository.js';
import { MongoConversationAuditRepository } from '../persistence/MongoConversationAuditRepository.js';
import { MongoConversationLockManager } from '../persistence/MongoConversationLockManager.js';
import { MongoConversationRepository } from '../persistence/MongoConversationRepository.js';
import { MongoConversationSnapshotRepository } from '../persistence/MongoConversationSnapshotRepository.js';
import { MongoOutboundMessageOutbox } from '../persistence/MongoOutboundMessageOutbox.js';
import { SkillRegistry } from '../skills/SkillRegistry.js';
import { SupportFaqSkill } from '../skills/catalog/support-faq/SupportFaqSkill.js';
import { WooCommerceOrderSkill } from '../skills/catalog/woocommerce-orders/WooCommerceOrderSkill.js';

export class Container {
  private static _instance: Container | undefined;

  readonly commandBus: ICommandBus;
  readonly queryBus: IQueryBus;
  readonly eventBus: IEventBus;
  readonly inboundMessageQueue: IInboundMessageQueue;
  readonly inboundMessageWorker: InboundMessageWorker;

  private constructor(
    commandBus: ICommandBus,
    queryBus: IQueryBus,
    eventBus: IEventBus,
    inboundMessageQueue: IInboundMessageQueue,
    inboundMessageWorker: InboundMessageWorker,
  ) {
    this.commandBus = commandBus;
    this.queryBus = queryBus;
    this.eventBus = eventBus;
    this.inboundMessageQueue = inboundMessageQueue;
    this.inboundMessageWorker = inboundMessageWorker;
  }

  static async build(): Promise<Container> {
    if (Container._instance) {
      return Container._instance;
    }

    const mongoClient = await MongoClient.connect(
      process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017',
    );
    const db = mongoClient.db(process.env['MONGODB_DB'] ?? 'orqo');

    const llmGateway = new ClaudeLlmGateway();
    const mcpGateway = new StdioMcpGateway();
    const whatsAppGateway = new MetaWhatsAppGateway();
    const conversationRepo = new MongoConversationRepository(db);
    const agentRepo = new MongoAgentRepository(db);
    const conversationLockManager = new MongoConversationLockManager(db);
    const conversationSnapshotRepository = new MongoConversationSnapshotRepository(db);
    const conversationAuditRepository = new MongoConversationAuditRepository(db);
    const outboundMessageOutbox = new MongoOutboundMessageOutbox(db);
    const eventBus = new InMemoryEventBus();
    const inboundMessageQueue = new MongoInboundMessageQueue(db, {
      maxAttempts: Number(process.env['INBOUND_QUEUE_MAX_ATTEMPTS'] ?? 4),
      leaseMs: Number(process.env['INBOUND_QUEUE_LEASE_MS'] ?? 30_000),
      baseRetryDelayMs: Number(process.env['INBOUND_QUEUE_RETRY_BASE_MS'] ?? 1_000),
    });

    const skillRegistry = new SkillRegistry();
    skillRegistry.register(new WooCommerceOrderSkill());
    skillRegistry.register(new SupportFaqSkill());

    const orchestration = new AgentOrchestrationService(
      llmGateway,
      skillRegistry,
      mcpGateway,
    );

    const commandBus = new InMemoryCommandBus();
    commandBus.register(
      'ProcessIncomingMessage',
      new ProcessIncomingMessageHandler(
        conversationRepo,
        agentRepo,
        orchestration,
        whatsAppGateway,
        eventBus,
        conversationLockManager,
        conversationSnapshotRepository,
        conversationAuditRepository,
        outboundMessageOutbox,
      ),
    );
    commandBus.register(
      'IngestInboundMessage',
      new IngestInboundMessageHandler(inboundMessageQueue),
    );

    const queryBus = new InMemoryQueryBus();
    const inboundMessageWorker = new InboundMessageWorker(
      commandBus,
      inboundMessageQueue,
    );

    Container._instance = new Container(
      commandBus,
      queryBus,
      eventBus,
      inboundMessageQueue,
      inboundMessageWorker,
    );

    return Container._instance;
  }

  static reset(): void {
    Container._instance = undefined;
  }
}
