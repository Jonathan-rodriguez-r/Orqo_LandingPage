import type { Collection, Db } from 'mongodb';
import type { IConversationRepository } from '../../domain/conversation/repositories/IConversationRepository.js';
import { Conversation } from '../../domain/conversation/entities/Conversation.js';
import { Message } from '../../domain/conversation/entities/Message.js';
import type { PhoneNumber } from '../../domain/conversation/value-objects/PhoneNumber.js';
import { PhoneNumber as PhoneNumberVO } from '../../domain/conversation/value-objects/PhoneNumber.js';

interface ConversationDoc {
  _id: string;
  workspaceId: string;
  phoneNumber: string;
  agentId: string;
  createdAt: Date;
  messages: Array<{
    id: string;
    content: string;
    role: string;
    timestamp: Date;
    status: string;
    metadata: Record<string, unknown>;
  }>;
}

export class MongoConversationRepository implements IConversationRepository {
  private readonly col: Collection<ConversationDoc>;

  constructor(db: Db) {
    this.col = db.collection<ConversationDoc>('conversations');
  }

  async findById(id: string): Promise<Conversation | null> {
    const doc = await this.col.findOne({ _id: id });
    return doc ? this.toDomain(doc) : null;
  }

  async findByPhone(workspaceId: string, phone: PhoneNumber): Promise<Conversation | null> {
    const doc = await this.col.findOne({ workspaceId, phoneNumber: phone.value });
    return doc ? this.toDomain(doc) : null;
  }

  async save(conversation: Conversation): Promise<void> {
    const doc = this.toDoc(conversation);
    await this.col.replaceOne({ _id: doc._id }, doc, { upsert: true });
  }

  async findRecent(workspaceId: string, limit = 50): Promise<Conversation[]> {
    const docs = await this.col
      .find({ workspaceId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
    return docs.map(d => this.toDomain(d));
  }

  private toDomain(doc: ConversationDoc): Conversation {
    const phoneResult = PhoneNumberVO.create(doc.phoneNumber);
    if (!phoneResult.ok) throw new Error(`Phone inválido en DB: ${doc.phoneNumber}`);

    const messages = doc.messages.map(
      m => new Message(m.id, m.content, m.role as any, m.timestamp, m.status as any, m.metadata),
    );

    return new Conversation(
      doc._id,
      doc.workspaceId,
      phoneResult.value,
      doc.agentId,
      doc.createdAt,
      messages,
    );
  }

  private toDoc(c: Conversation): ConversationDoc {
    return {
      _id: c.id,
      workspaceId: c.workspaceId,
      phoneNumber: c.phoneNumber.value,
      agentId: c.agentId,
      createdAt: c.createdAt,
      messages: c.messages.map(m => ({
        id: m.id,
        content: m.content,
        role: m.role,
        timestamp: m.timestamp,
        status: m.status,
        metadata: { ...m.metadata },
      })),
    };
  }
}
