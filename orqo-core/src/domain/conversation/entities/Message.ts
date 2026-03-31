export type MessageRole = 'user' | 'assistant' | 'system';
export type MessageStatus = 'received' | 'processing' | 'sent' | 'failed';

export class Message {
  constructor(
    public readonly id: string,
    public readonly content: string,
    public readonly role: MessageRole,
    public readonly timestamp: Date,
    public status: MessageStatus,
    public readonly metadata: Readonly<Record<string, unknown>> = {},
  ) {}

  static createUserMessage(
    content: string,
    metadata?: Record<string, unknown>,
  ): Message {
    return new Message(
      crypto.randomUUID(),
      content,
      'user',
      new Date(),
      'received',
      metadata ?? {},
    );
  }

  static createAssistantMessage(content: string): Message {
    return new Message(
      crypto.randomUUID(),
      content,
      'assistant',
      new Date(),
      'sent',
    );
  }

  markFailed(): void {
    this.status = 'failed';
  }
}
