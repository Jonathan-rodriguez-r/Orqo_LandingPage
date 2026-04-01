import type { Collection, Db } from 'mongodb';
import type {
  IOutboundMessageOutbox,
  PendingOutboundMessage,
} from '../../application/ports/IOutboundMessageOutbox.js';

interface OutboundMessageOutboxDoc extends PendingOutboundMessage {
  _id: string;
  status: 'pending' | 'sent' | 'failed';
  createdAt: Date;
  updatedAt: Date;
  providerMessageId?: string;
  failureReason?: string;
}

export class MongoOutboundMessageOutbox implements IOutboundMessageOutbox {
  private readonly col: Collection<OutboundMessageOutboxDoc>;

  constructor(db: Db) {
    this.col = db.collection<OutboundMessageOutboxDoc>('outbound_message_outbox');
    void this.col.createIndex({ workspaceId: 1, status: 1, createdAt: -1 });
  }

  async createPending(message: PendingOutboundMessage): Promise<string> {
    const id = crypto.randomUUID();
    const now = new Date();

    await this.col.insertOne({
      _id: id,
      ...message,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    });

    return id;
  }

  async markSent(outboxId: string, providerMessageId: string): Promise<void> {
    await this.col.updateOne(
      { _id: outboxId },
      {
        $set: {
          status: 'sent',
          providerMessageId,
          updatedAt: new Date(),
        },
        $unset: {
          failureReason: '',
        },
      },
    );
  }

  async markFailed(outboxId: string, reason: string): Promise<void> {
    await this.col.updateOne(
      { _id: outboxId },
      {
        $set: {
          status: 'failed',
          failureReason: reason,
          updatedAt: new Date(),
        },
      },
    );
  }
}
