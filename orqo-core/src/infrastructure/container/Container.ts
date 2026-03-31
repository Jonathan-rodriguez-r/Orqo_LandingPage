import { MongoClient } from 'mongodb';
import { InMemoryCommandBus, type ICommandBus } from '../../shared/CommandBus.js';
import { InMemoryQueryBus, type IQueryBus } from '../../shared/QueryBus.js';
import { InMemoryEventBus, type IEventBus } from '../../shared/EventBus.js';
import { AgentOrchestrationService } from '../../application/services/AgentOrchestrationService.js';
import { ProcessIncomingMessageHandler } from '../../application/commands/process-message/ProcessIncomingMessageHandler.js';
import { SkillRegistry } from '../skills/SkillRegistry.js';
import { ClaudeLlmGateway } from '../llm/ClaudeLlmGateway.js';
import { StdioMcpGateway } from '../mcp/StdioMcpGateway.js';
import { MongoConversationRepository } from '../persistence/MongoConversationRepository.js';
import { MongoAgentRepository } from '../persistence/MongoAgentRepository.js';
import { MetaWhatsAppGateway } from '../messaging/MetaWhatsAppGateway.js';
// ── Skills ────────────────────────────────────────────────────────────────────
import { WooCommerceOrderSkill } from '../skills/catalog/woocommerce-orders/WooCommerceOrderSkill.js';
import { SupportFaqSkill } from '../skills/catalog/support-faq/SupportFaqSkill.js';
// NUEVA SKILL → importar aquí y registrar en buildSkillRegistry()

/**
 * ─── Container — Composition Root ───────────────────────────────────────────
 *
 * Único lugar del sistema donde se instancian implementaciones concretas.
 * La Application Layer y el Domain solo ven abstracciones (interfaces).
 *
 * Para agregar una nueva Skill:
 *   1. Crear archivo en infrastructure/skills/catalog/<nombre>/<NombreSkill>.ts
 *   2. Importarla aquí (línea marcada con "NUEVA SKILL")
 *   3. Añadir: registry.register(new NombreSkill())
 *   ← Eso es todo. Cero cambios en el core.
 *
 * Para cambiar el LLM de Claude a GPT-4:
 *   1. Crear OpenAILlmGateway que implemente ILlmGateway
 *   2. Reemplazar ClaudeLlmGateway en buildInfrastructure()
 *   ← Cero cambios en la Application Layer.
 */
export class Container {
  private static _instance: Container | undefined;

  readonly commandBus: ICommandBus;
  readonly queryBus: IQueryBus;
  readonly eventBus: IEventBus;

  private constructor(
    commandBus: ICommandBus,
    queryBus: IQueryBus,
    eventBus: IEventBus,
  ) {
    this.commandBus = commandBus;
    this.queryBus = queryBus;
    this.eventBus = eventBus;
  }

  static async build(): Promise<Container> {
    if (Container._instance) return Container._instance;

    // ── Infraestructura ──────────────────────────────────────────────────
    const mongoClient = await MongoClient.connect(
      process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017',
    );
    const db = mongoClient.db(process.env['MONGODB_DB'] ?? 'orqo');

    const llmGateway = new ClaudeLlmGateway();
    const mcpGateway = new StdioMcpGateway();
    const whatsAppGateway = new MetaWhatsAppGateway();
    const conversationRepo = new MongoConversationRepository(db);
    const agentRepo = new MongoAgentRepository(db);
    const eventBus = new InMemoryEventBus();

    // ── Skills ────────────────────────────────────────────────────────────
    const skillRegistry = new SkillRegistry();
    skillRegistry.register(new WooCommerceOrderSkill());
    skillRegistry.register(new SupportFaqSkill());
    // ↓ Agregar nuevas Skills aquí ↓

    // ── Servicios de aplicación ───────────────────────────────────────────
    const orchestration = new AgentOrchestrationService(
      llmGateway,
      skillRegistry,
      mcpGateway,
    );

    // ── Command Bus ────────────────────────────────────────────────────────
    const commandBus = new InMemoryCommandBus();
    commandBus.register(
      'ProcessIncomingMessage',
      new ProcessIncomingMessageHandler(
        conversationRepo,
        agentRepo,
        orchestration,
        whatsAppGateway,
        eventBus,
      ),
    );

    // ── Query Bus ──────────────────────────────────────────────────────────
    const queryBus = new InMemoryQueryBus();
    // queryBus.register('GetConversation', new GetConversationHandler(conversationRepo));

    Container._instance = new Container(commandBus, queryBus, eventBus);
    return Container._instance;
  }

  /** Solo para tests — permite inyectar mocks. */
  static reset(): void {
    Container._instance = undefined;
  }
}
