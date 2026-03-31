import type { DomainEvent } from '../../../shared/DomainEvent.js';
import { Message } from './Message.js';
import type { PhoneNumber } from '../value-objects/PhoneNumber.js';
import { MessageReceived } from '../events/MessageReceived.js';
import { AgentResponseGenerated } from '../events/AgentResponseGenerated.js';

/**
 * Aggregate Root: Conversation.
 *
 * Contiene toda la lógica de negocio relativa a una conversación.
 * Nunca depende de servicios externos — solo genera eventos que
 * el Application Layer publicará después de persistir.
 */
export class Conversation {
  private readonly _messages: Message[] = [];
  private readonly _domainEvents: DomainEvent[] = [];

  constructor(
    public readonly id: string,
    public readonly workspaceId: string,
    public readonly phoneNumber: PhoneNumber,
    public readonly agentId: string,
    public readonly createdAt: Date = new Date(),
    messages: Message[] = [],
  ) {
    this._messages.push(...messages);
  }

  // ── Queries ──────────────────────────────────────────────────────────────

  get messages(): ReadonlyArray<Message> {
    return this._messages;
  }

  get messageCount(): number {
    return this._messages.length;
  }

  /** Últimos N turnos formateados para pasar al LLM. */
  getRecentHistory(limit = 20): Array<{ role: 'user' | 'assistant'; content: string }> {
    return this._messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-limit)
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
  }

  /** Consume y devuelve los eventos pendientes de publicar. */
  pullDomainEvents(): DomainEvent[] {
    const events = [...this._domainEvents];
    this._domainEvents.length = 0;
    return events;
  }

  // ── Commands ─────────────────────────────────────────────────────────────

  receiveUserMessage(
    content: string,
    metadata?: Record<string, unknown>,
  ): Message {
    const msg = Message.createUserMessage(content, metadata);
    this._messages.push(msg);
    this._domainEvents.push(
      new MessageReceived(this.id, msg.id, content, this.phoneNumber.value),
    );
    return msg;
  }

  addAgentResponse(content: string, skillUsed?: string): Message {
    const msg = Message.createAssistantMessage(content);
    this._messages.push(msg);
    this._domainEvents.push(
      new AgentResponseGenerated(this.id, msg.id, content, skillUsed),
    );
    return msg;
  }

  // ── Factory ───────────────────────────────────────────────────────────────

  static create(
    workspaceId: string,
    phoneNumber: PhoneNumber,
    agentId: string,
  ): Conversation {
    return new Conversation(
      crypto.randomUUID(),
      workspaceId,
      phoneNumber,
      agentId,
    );
  }
}
