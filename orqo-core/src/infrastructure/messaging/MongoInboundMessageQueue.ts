import type { Collection, Db } from 'mongodb';
import type {
  IInboundMessageQueue,
  InboundMessageEnqueueReceipt,
  InboundMessageQueueJob,
  QueueStats,
} from '../../application/ports/IInboundMessageQueue.js';
import { CanonicalMessageEnvelope } from '../../domain/messaging/entities/CanonicalMessageEnvelope.js';
import { Err, Ok, type Result } from '../../shared/Result.js';

type QueueStatus = 'pending' | 'processing' | 'completed' | 'dead-letter';

interface QueueEnvelopeDoc {
  workspaceId: string;
  channel: string;
  provider: string;
  providerAccountId: string;
  externalMessageId: string;
  senderExternalId: string;
  occurredAt: Date;
  payload: {
    type: 'text';
    text: string;
  };
  correlationId: string;
  metadata: Record<string, unknown>;
}

interface QueueJobDoc {
  _id: string;
  dedupeKey: string;
  envelope: QueueEnvelopeDoc;
  status: QueueStatus;
  attempts: number;
  maxAttempts: number;
  availableAt: Date;
  enqueuedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  lockExpiresAt?: Date;
  lastError?: string;
  completedAt?: Date;
  deadLetteredAt?: Date;
}

export interface MongoInboundMessageQueueOptions {
  readonly maxAttempts?: number;
  readonly leaseMs?: number;
  readonly baseRetryDelayMs?: number;
}

export class MongoInboundMessageQueue implements IInboundMessageQueue {
  private readonly col: Collection<QueueJobDoc>;
  private readonly maxAttempts: number;
  private readonly leaseMs: number;
  private readonly baseRetryDelayMs: number;

  constructor(
    db: Db,
    options: MongoInboundMessageQueueOptions = {},
  ) {
    this.col = db.collection<QueueJobDoc>('inbound_message_queue');
    this.maxAttempts = options.maxAttempts ?? 4;
    this.leaseMs = options.leaseMs ?? 30_000;
    this.baseRetryDelayMs = options.baseRetryDelayMs ?? 1_000;

    void this.col.createIndex({ dedupeKey: 1 }, { unique: true });
    void this.col.createIndex({ status: 1, availableAt: 1, createdAt: 1 });
    void this.col.createIndex({ status: 1, lockExpiresAt: 1 });
  }

  async enqueue(
    envelope: CanonicalMessageEnvelope,
  ): Promise<Result<InboundMessageEnqueueReceipt>> {
    const now = new Date();
    const jobId = crypto.randomUUID();

    try {
      await this.col.insertOne({
        _id: jobId,
        dedupeKey: envelope.dedupeKey,
        envelope: {
          workspaceId: envelope.workspaceId,
          channel: envelope.channel,
          provider: envelope.provider,
          providerAccountId: envelope.providerAccountId,
          externalMessageId: envelope.externalMessageId,
          senderExternalId: envelope.senderExternalId,
          occurredAt: envelope.occurredAt,
          payload: envelope.payload,
          correlationId: envelope.correlationId,
          metadata: { ...envelope.metadata },
        },
        status: 'pending',
        attempts: 0,
        maxAttempts: this.maxAttempts,
        availableAt: now,
        enqueuedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      return Ok({
        jobId,
        dedupeKey: envelope.dedupeKey,
        status: 'queued',
      });
    } catch (error) {
      const duplicate = error as { code?: number };
      if (duplicate.code !== 11000) {
        return Err(error instanceof Error ? error : new Error(String(error)));
      }

      const existing = await this.col.findOne({ dedupeKey: envelope.dedupeKey });
      if (!existing) {
        return Err(new Error(`No se pudo recuperar el job duplicado para ${envelope.dedupeKey}`));
      }

      return Ok({
        jobId: existing._id,
        dedupeKey: envelope.dedupeKey,
        status: 'duplicate',
      });
    }
  }

  async reserveNext(): Promise<Result<InboundMessageQueueJob | null>> {
    const now = new Date();
    const lockExpiresAt = new Date(now.getTime() + this.leaseMs);

    const doc = await this.col.findOneAndUpdate(
      {
        $or: [
          { status: 'pending', availableAt: { $lte: now } },
          { status: 'processing', lockExpiresAt: { $lte: now } },
        ],
      },
      {
        $set: {
          status: 'processing',
          lockExpiresAt,
          updatedAt: now,
        },
        $inc: {
          attempts: 1,
        },
      },
      {
        sort: {
          availableAt: 1,
          createdAt: 1,
        },
        returnDocument: 'after',
      },
    );

    if (!doc) {
      return Ok(null);
    }

    return Ok(this.toJob(doc));
  }

  async complete(jobId: string): Promise<Result<void>> {
    const result = await this.col.updateOne(
      { _id: jobId, status: 'processing' },
      {
        $set: {
          status: 'completed',
          completedAt: new Date(),
          updatedAt: new Date(),
        },
        $unset: {
          lockExpiresAt: '',
          lastError: '',
        },
      },
    );

    if (result.matchedCount === 0) {
      return Err(new Error(`No existe job processing con id ${jobId}`));
    }

    return Ok(undefined);
  }

  async fail(jobId: string, reason: string): Promise<Result<void>> {
    const current = await this.col.findOne({ _id: jobId, status: 'processing' });
    if (!current) {
      return Err(new Error(`No existe job processing con id ${jobId}`));
    }

    const now = new Date();
    if (current.attempts >= current.maxAttempts) {
      await this.col.updateOne(
        { _id: jobId },
        {
          $set: {
            status: 'dead-letter',
            deadLetteredAt: now,
            lastError: reason,
            updatedAt: now,
          },
          $unset: {
            lockExpiresAt: '',
          },
        },
      );
      return Ok(undefined);
    }

    const retryAt = new Date(now.getTime() + this.computeRetryDelay(current.attempts));
    await this.col.updateOne(
      { _id: jobId },
      {
        $set: {
          status: 'pending',
          availableAt: retryAt,
          lastError: reason,
          updatedAt: now,
        },
        $unset: {
          lockExpiresAt: '',
        },
      },
    );

    return Ok(undefined);
  }

  async stats(): Promise<QueueStats> {
    const [pending, processing, deadLetter] = await Promise.all([
      this.col.countDocuments({ status: 'pending' }),
      this.col.countDocuments({ status: 'processing' }),
      this.col.countDocuments({ status: 'dead-letter' }),
    ]);
    return { pending, processing, deadLetter };
  }

  private computeRetryDelay(attempts: number): number {
    const multiplier = Math.max(1, 2 ** (attempts - 1));
    return this.baseRetryDelayMs * multiplier;
  }

  private toJob(doc: QueueJobDoc): InboundMessageQueueJob {
    const envelopeResult = CanonicalMessageEnvelope.create({
      workspaceId: doc.envelope.workspaceId,
      channel: doc.envelope.channel as import('../../domain/messaging/entities/CanonicalMessageEnvelope.js').CanonicalChannel,
      provider: doc.envelope.provider as import('../../domain/messaging/entities/CanonicalMessageEnvelope.js').CanonicalProvider,
      providerAccountId: doc.envelope.providerAccountId,
      externalMessageId: doc.envelope.externalMessageId,
      senderExternalId: doc.envelope.senderExternalId,
      occurredAt: doc.envelope.occurredAt,
      payload: doc.envelope.payload,
      correlationId: doc.envelope.correlationId,
      metadata: doc.envelope.metadata,
    });

    if (!envelopeResult.ok) {
      throw envelopeResult.error;
    }

    return {
      jobId: doc._id,
      envelope: envelopeResult.value,
      attempts: doc.attempts,
      enqueuedAt: doc.enqueuedAt,
    };
  }
}
