import type { ICommandHandler } from '../../../shared/CommandBus.js';
import { Ok, Err, type Result } from '../../../shared/Result.js';
import type { IEventBus } from '../../../shared/EventBus.js';
import type { ProcessIncomingMessageCommand } from './ProcessIncomingMessageCommand.js';
import type { IConversationRepository } from '../../../domain/conversation/repositories/IConversationRepository.js';
import { PhoneNumber } from '../../../domain/conversation/value-objects/PhoneNumber.js';
import { Conversation } from '../../../domain/conversation/entities/Conversation.js';
import type { IWhatsAppGateway } from '../../ports/IWhatsAppGateway.js';
import type { AgentOrchestrationService } from '../../services/AgentOrchestrationService.js';
import type { IAgentRepository } from '../../ports/IAgentRepository.js';

/**
 * ─── ProcessIncomingMessageHandler ──────────────────────────────────────────
 *
 * CASO DE USO CENTRAL — enrutador del mensaje entrante.
 *
 * Responsabilidades (Single Responsibility por capa):
 *   1. Validar el número de teléfono (Value Object)
 *   2. Cargar o crear la Conversation (Aggregate)
 *   3. Delegar la orquestación al AgentOrchestrationService
 *   4. Persistir el estado de la conversación
 *   5. Enviar la respuesta por el canal de mensajería
 *   6. Publicar Domain Events
 *
 * Lo que NO hace este handler:
 *   - No sabe qué Skills existen (Open/Closed)
 *   - No llama directamente al LLM ni a MCP
 *   - No contiene lógica de retry (responsabilidad de la infraestructura)
 */
export class ProcessIncomingMessageHandler
  implements ICommandHandler<ProcessIncomingMessageCommand, string>
{
  constructor(
    private readonly conversationRepo: IConversationRepository,
    private readonly agentRepo: IAgentRepository,
    private readonly orchestration: AgentOrchestrationService,
    private readonly whatsappGateway: IWhatsAppGateway,
    private readonly eventBus: IEventBus,
  ) {}

  async handle(
    command: ProcessIncomingMessageCommand,
  ): Promise<Result<string>> {
    // ── 1. Validar número de teléfono ─────────────────────────────────────
    const phoneResult = PhoneNumber.create(command.fromPhone);
    if (!phoneResult.ok) return Err(phoneResult.error);
    const phone = phoneResult.value;

    // ── 2. Cargar agente del workspace ────────────────────────────────────
    const agent = await this.agentRepo.findActiveByWorkspace(command.workspaceId);
    if (!agent) {
      return Err(new Error(`No hay agente activo para workspace: ${command.workspaceId}`));
    }

    // ── 3. Cargar o crear Conversation ────────────────────────────────────
    let conversation = await this.conversationRepo.findByPhone(
      command.workspaceId,
      phone,
    );

    if (!conversation) {
      conversation = Conversation.create(command.workspaceId, phone, agent.id);
    }

    // ── 4. Registrar mensaje del usuario en el Aggregate ──────────────────
    conversation.receiveUserMessage(command.body, {
      platformMessageId: command.platformMessageId,
      timestamp: command.timestamp.toISOString(),
    });

    // ── 5. Orquestar respuesta del agente ─────────────────────────────────
    const orchestrationResult = await this.orchestration.generateResponse(
      conversation,
      agent,
    );

    if (!orchestrationResult.ok) {
      // Persistimos el mensaje del usuario aunque la orquestación falle
      await this.conversationRepo.save(conversation);
      return Err(orchestrationResult.error);
    }

    const { responseText, skillUsed } = orchestrationResult.value;

    // ── 6. Agregar respuesta al Aggregate ─────────────────────────────────
    conversation.addAgentResponse(responseText, skillUsed);

    // ── 7. Persistir (antes de enviar — evita pérdida de estado si WA falla)
    await this.conversationRepo.save(conversation);

    // ── 8. Enviar por WhatsApp ─────────────────────────────────────────────
    const sendResult = await this.whatsappGateway.sendMessage({
      to: phone.value,
      body: responseText,
      type: 'text',
    });

    if (!sendResult.ok) return Err(sendResult.error);

    // ── 9. Publicar Domain Events ─────────────────────────────────────────
    const events = conversation.pullDomainEvents();
    await this.eventBus.publishAll(events);

    return Ok(sendResult.value.messageId);
  }
}
