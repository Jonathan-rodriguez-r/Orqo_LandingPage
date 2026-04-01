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
import type { IConversationLockManager } from '../../ports/IConversationLockManager.js';
import type { IConversationSnapshotRepository } from '../../ports/IConversationSnapshotRepository.js';
import type { IConversationAuditRepository } from '../../ports/IConversationAuditRepository.js';
import type { IOutboundMessageOutbox } from '../../ports/IOutboundMessageOutbox.js';
import { buildConversationStateSnapshot } from '../../services/ConversationStateSnapshotFactory.js';

export class ProcessIncomingMessageHandler
  implements ICommandHandler<ProcessIncomingMessageCommand, string>
{
  constructor(
    private readonly conversationRepo: IConversationRepository,
    private readonly agentRepo: IAgentRepository,
    private readonly orchestration: AgentOrchestrationService,
    private readonly whatsappGateway: IWhatsAppGateway,
    private readonly eventBus: IEventBus,
    private readonly lockManager: IConversationLockManager,
    private readonly snapshotRepository: IConversationSnapshotRepository,
    private readonly auditRepository: IConversationAuditRepository,
    private readonly outboundMessageOutbox: IOutboundMessageOutbox,
  ) {}

  async handle(
    command: ProcessIncomingMessageCommand,
  ): Promise<Result<string>> {
    const phoneResult = PhoneNumber.create(command.fromPhone);
    if (!phoneResult.ok) {
      return Err(phoneResult.error);
    }
    const phone = phoneResult.value;

    const lockResult = await this.lockManager.acquire(
      command.workspaceId,
      `phone:${phone.value}`,
    );
    if (!lockResult.ok) {
      return Err(lockResult.error);
    }

    try {
      const agent = await this.agentRepo.findActiveByWorkspace(command.workspaceId);
      if (!agent) {
        return Err(new Error(`No hay agente activo para workspace: ${command.workspaceId}`));
      }

      let conversation = await this.conversationRepo.findByPhone(
        command.workspaceId,
        phone,
      );

      if (!conversation) {
        conversation = Conversation.create(command.workspaceId, phone, agent.id);
      }

      conversation.receiveUserMessage(command.body, {
        platformMessageId: command.platformMessageId,
        timestamp: command.timestamp.toISOString(),
      });

      const orchestrationResult = await this.orchestration.generateResponse(
        conversation,
        agent,
      );

      if (!orchestrationResult.ok) {
        await this.conversationRepo.save(conversation);
        await this.snapshotRepository.save(
          buildConversationStateSnapshot(conversation),
        );
        return Err(orchestrationResult.error);
      }

      const { responseText, skillUsed } = orchestrationResult.value;
      conversation.addAgentResponse(responseText, skillUsed);

      await this.conversationRepo.save(conversation);

      const outboxId = await this.outboundMessageOutbox.createPending({
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
        channel: 'whatsapp',
        recipient: phone.value,
        body: responseText,
        correlationId: command.platformMessageId,
      });

      const sendResult = await this.whatsappGateway.sendMessage({
        to: phone.value,
        body: responseText,
        type: 'text',
      });

      if (!sendResult.ok) {
        await this.outboundMessageOutbox.markFailed(
          outboxId,
          sendResult.error.message,
        );
        await this.snapshotRepository.save(
          buildConversationStateSnapshot(conversation, skillUsed),
        );
        return Err(sendResult.error);
      }

      await this.outboundMessageOutbox.markSent(
        outboxId,
        sendResult.value.messageId,
      );

      const events = conversation.pullDomainEvents();
      await this.auditRepository.append(
        conversation.workspaceId,
        conversation.id,
        events,
      );
      await this.eventBus.publishAll(events);
      await this.snapshotRepository.save(
        buildConversationStateSnapshot(conversation, skillUsed),
      );

      return Ok(sendResult.value.messageId);
    } finally {
      await this.lockManager.release(lockResult.value);
    }
  }
}
