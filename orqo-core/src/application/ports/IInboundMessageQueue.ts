import type { CanonicalMessageEnvelope } from '../../domain/messaging/entities/CanonicalMessageEnvelope.js';
import type { Result } from '../../shared/Result.js';

export interface InboundMessageEnqueueReceipt {
  readonly jobId: string;
  readonly dedupeKey: string;
  readonly status: 'queued' | 'duplicate';
}

export interface InboundMessageQueueJob {
  readonly jobId: string;
  readonly envelope: CanonicalMessageEnvelope;
  readonly attempts: number;
  readonly enqueuedAt: Date;
}

export interface QueueStats {
  pending: number;
  processing: number;
  deadLetter: number;
}

export interface IInboundMessageQueue {
  enqueue(
    envelope: CanonicalMessageEnvelope,
  ): Promise<Result<InboundMessageEnqueueReceipt>>;
  reserveNext(): Promise<Result<InboundMessageQueueJob | null>>;
  complete(jobId: string): Promise<Result<void>>;
  fail(jobId: string, reason: string): Promise<Result<void>>;
  stats(): Promise<QueueStats>;
}
