import type { Collection, Db, Filter } from 'mongodb';
import type {
  IOutboundMessageOutbox,
  OutboundMessageStatus,
  OutboundMessageStatusUpdate,
  PendingOutboundMessage,
} from '../../application/ports/IOutboundMessageOutbox.js';

interface OutboundMessageOutboxDoc extends PendingOutboundMessage {
  _id: string;
  status: OutboundMessageStatus;
  createdAt: Date;
  updatedAt: Date;
  providerMessageId?: string;
  providerAccountId?: string;
  providerStatusUpdatedAt?: Date;
  providerStatusMetadata?: Record<string, unknown>;
  providerStatusRecipient?: string;
  failureReason?: string;
}

function allowedPreviousStatuses(status: OutboundMessageStatusUpdate['status']): OutboundMessageStatus[] {
  switch (status) {
    case 'sent':
      return ['pending', 'sent'];
    case 'delivered':
      return ['pending', 'sent', 'delivered'];
    case 'read':
      return ['pending', 'sent', 'delivered', 'read'];
    case 'failed':
      return ['pending', 'sent', 'failed'];
    case 'deleted':
      return ['pending', 'sent', 'delivered', 'read', 'failed', 'deleted'];
  }
}

export class MongoOutboundMessageOutbox implements IOutboundMessageOutbox {
  private readonly col: Collection<OutboundMessageOutboxDoc>;

  constructor(db: Db) {
    this.col = db.collection<OutboundMessageOutboxDoc>('outbound_message_outbox');
    void this.col.createIndex({ workspaceId: 1, status: 1, createdAt: -1 });
    void this.col.createIndex({ workspaceId: 1, providerMessageId: 1 }, { sparse: true });
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
          providerStatusUpdatedAt: new Date(),
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

  async markProviderStatus(update: OutboundMessageStatusUpdate): Promise<boolean> {
    const setFields: Partial<OutboundMessageOutboxDoc> = {
      status: update.status,
      providerStatusUpdatedAt: update.occurredAt,
      updatedAt: new Date(),
      ...(update.providerAccountId !== undefined ? { providerAccountId: update.providerAccountId } : {}),
      ...(update.recipient !== undefined ? { providerStatusRecipient: update.recipient } : {}),
      ...(update.metadata !== undefined ? { providerStatusMetadata: update.metadata } : {}),
      ...(update.status === 'failed' && update.failureReason !== undefined
        ? { failureReason: update.failureReason }
        : {}),
    };

    const filter: Filter<OutboundMessageOutboxDoc> = {
      workspaceId: update.workspaceId,
      providerMessageId: update.providerMessageId,
      status: { $in: allowedPreviousStatuses(update.status) },
    };

    const result = await this.col.updateOne(
      filter,
      {
        $set: setFields,
        ...(update.status !== 'failed' ? { $unset: { failureReason: '' } } : {}),
      },
    );

    if (result.matchedCount > 0) return true;

    const existing = await this.col.findOne(
      {
        workspaceId: update.workspaceId,
        providerMessageId: update.providerMessageId,
      },
      { projection: { _id: 1 } },
    );
    return existing !== null;
  }
}
