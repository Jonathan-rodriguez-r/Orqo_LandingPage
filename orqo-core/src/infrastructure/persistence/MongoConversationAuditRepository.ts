import type { Collection, Db } from 'mongodb';
import type { IConversationAuditRepository } from '../../application/ports/IConversationAuditRepository.js';
import type { DomainEvent } from '../../shared/DomainEvent.js';

interface ConversationAuditDoc {
  _id: string;
  workspaceId: string;
  conversationId: string;
  eventId: string;
  eventName: string;
  occurredAt: Date;
  payload: Record<string, unknown>;
}

export class MongoConversationAuditRepository
  implements IConversationAuditRepository
{
  private readonly col: Collection<ConversationAuditDoc>;

  constructor(db: Db) {
    this.col = db.collection<ConversationAuditDoc>('conversation_audit_log');
    void this.col.createIndex({ workspaceId: 1, conversationId: 1, occurredAt: -1 });
  }

  async append(
    workspaceId: string,
    conversationId: string,
    events: DomainEvent[],
  ): Promise<void> {
    if (events.length === 0) {
      return;
    }

    await this.col.insertMany(
      events.map(event => ({
        _id: event.eventId,
        workspaceId,
        conversationId,
        eventId: event.eventId,
        eventName: event.eventName,
        occurredAt: event.occurredAt,
        payload: this.serializeEvent(event),
      })),
      { ordered: true },
    );
  }

  private serializeEvent(event: DomainEvent): Record<string, unknown> {
    const payload: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(event as unknown as Record<string, unknown>)) {
      if (key === 'eventId' || key === 'eventName' || key === 'occurredAt') {
        continue;
      }
      payload[key] = value;
    }
    return payload;
  }
}
