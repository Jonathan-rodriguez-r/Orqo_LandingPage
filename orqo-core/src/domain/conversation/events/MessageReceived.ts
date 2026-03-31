import { DomainEvent } from '../../../shared/DomainEvent.js';

export class MessageReceived extends DomainEvent {
  get eventName(): string { return 'conversation.message.received'; }

  constructor(
    conversationId: string,
    public readonly messageId: string,
    public readonly content: string,
    public readonly fromPhone: string,
  ) {
    super(conversationId);
  }
}
