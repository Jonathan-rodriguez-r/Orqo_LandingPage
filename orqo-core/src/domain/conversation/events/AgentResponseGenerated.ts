import { DomainEvent } from '../../../shared/DomainEvent.js';

export class AgentResponseGenerated extends DomainEvent {
  get eventName(): string { return 'conversation.agent.responded'; }

  constructor(
    conversationId: string,
    public readonly messageId: string,
    public readonly content: string,
    public readonly skillUsed?: string,
  ) {
    super(conversationId);
  }
}
