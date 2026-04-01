import type { DomainEvent } from '../../shared/DomainEvent.js';

export interface IConversationAuditRepository {
  append(
    workspaceId: string,
    conversationId: string,
    events: DomainEvent[],
  ): Promise<void>;
}
