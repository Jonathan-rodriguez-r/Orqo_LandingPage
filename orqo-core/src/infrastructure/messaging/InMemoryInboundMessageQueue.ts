import type {
  IInboundMessageQueue,
  InboundMessageEnqueueReceipt,
  InboundMessageQueueJob,
  QueueStats,
} from '../../application/ports/IInboundMessageQueue.js';
import type { CanonicalMessageEnvelope } from '../../domain/messaging/entities/CanonicalMessageEnvelope.js';
import { Err, Ok, type Result } from '../../shared/Result.js';

interface MutableQueueJob extends InboundMessageQueueJob {
  attempts: number;
  availableAt: Date;
}

interface DeadLetterQueueJob extends InboundMessageQueueJob {
  readonly deadLetteredAt: Date;
  readonly reason: string;
}

export interface InMemoryInboundMessageQueueOptions {
  readonly maxAttempts?: number;
  readonly baseRetryDelayMs?: number;
}

export class InMemoryInboundMessageQueue implements IInboundMessageQueue {
  private readonly pending: MutableQueueJob[] = [];
  private readonly inflight = new Map<string, MutableQueueJob>();
  private readonly deadLetter: DeadLetterQueueJob[] = [];
  private readonly dedupeIndex = new Map<string, string>();
  private readonly maxAttempts: number;
  private readonly baseRetryDelayMs: number;

  constructor(options: InMemoryInboundMessageQueueOptions = {}) {
    this.maxAttempts = options.maxAttempts ?? 4;
    this.baseRetryDelayMs = options.baseRetryDelayMs ?? 1_000;
  }

  async enqueue(
    envelope: CanonicalMessageEnvelope,
  ): Promise<Result<InboundMessageEnqueueReceipt>> {
    const existingJobId = this.dedupeIndex.get(envelope.dedupeKey);
    if (existingJobId) {
      return Ok({
        jobId: existingJobId,
        dedupeKey: envelope.dedupeKey,
        status: 'duplicate',
      });
    }

    const jobId = crypto.randomUUID();
    this.dedupeIndex.set(envelope.dedupeKey, jobId);
    const now = new Date();
    this.pending.push({
      jobId,
      envelope,
      attempts: 0,
      enqueuedAt: now,
      availableAt: now,
    });

    return Ok({
      jobId,
      dedupeKey: envelope.dedupeKey,
      status: 'queued',
    });
  }

  async reserveNext(): Promise<Result<InboundMessageQueueJob | null>> {
    const now = new Date();
    const nextIndex = this.pending.findIndex(job => job.availableAt <= now);
    if (nextIndex === -1) {
      return Ok(null);
    }

    const [nextJob] = this.pending.splice(nextIndex, 1);
    if (!nextJob) {
      return Ok(null);
    }

    nextJob.attempts += 1;
    this.inflight.set(nextJob.jobId, nextJob);
    return Ok(nextJob);
  }

  async complete(jobId: string): Promise<Result<void>> {
    if (!this.inflight.delete(jobId)) {
      return Err(new Error(`No existe job inflight con id ${jobId}`));
    }
    return Ok(undefined);
  }

  async fail(jobId: string, reason: string): Promise<Result<void>> {
    const job = this.inflight.get(jobId);
    if (!job) {
      return Err(new Error(`No existe job inflight con id ${jobId}`));
    }

    this.inflight.delete(jobId);

    if (job.attempts >= this.maxAttempts) {
      this.deadLetter.push({
        jobId: job.jobId,
        envelope: job.envelope,
        attempts: job.attempts,
        enqueuedAt: job.enqueuedAt,
        deadLetteredAt: new Date(),
        reason,
      });
      return Ok(undefined);
    }

    job.availableAt = new Date(
      Date.now() + this.computeRetryDelay(job.attempts),
    );
    this.pending.push(job);

    return Ok(undefined);
  }

  snapshot(): {
    readonly pending: number;
    readonly inflight: number;
    readonly deadLetter: number;
  } {
    return {
      pending: this.pending.length,
      inflight: this.inflight.size,
      deadLetter: this.deadLetter.length,
    };
  }

  async stats(): Promise<QueueStats> {
    return {
      pending: this.pending.length,
      processing: this.inflight.size,
      deadLetter: this.deadLetter.length,
    };
  }

  private computeRetryDelay(attempts: number): number {
    const multiplier = Math.max(1, 2 ** (attempts - 1));
    return this.baseRetryDelayMs * multiplier;
  }
}
