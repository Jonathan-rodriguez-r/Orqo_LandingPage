import { createProcessIncomingMessageCommand } from '../../application/commands/process-message/ProcessIncomingMessageCommand.js';
import type { IInboundMessageQueue } from '../../application/ports/IInboundMessageQueue.js';
import type { ICommandBus } from '../../shared/CommandBus.js';
import { Err, Ok, type Result } from '../../shared/Result.js';

/**
 * Worker bootstrap que conecta el ingress canónico con el caso de uso actual.
 */
export class InboundMessageWorker {
  private poller: NodeJS.Timeout | undefined;
  private draining = false;

  constructor(
    private readonly commandBus: ICommandBus,
    private readonly inboundQueue: IInboundMessageQueue,
  ) {}

  startPolling(intervalMs = 250): void {
    if (this.poller) {
      return;
    }

    const tick = async () => {
      if (this.draining) {
        return;
      }

      this.draining = true;
      try {
        const result = await this.drainOnce();
        if (!result.ok) {
          console.error('[InboundWorker] Error drenando cola:', result.error.message);
        }
      } finally {
        this.draining = false;
      }
    };

    this.poller = setInterval(() => {
      void tick();
    }, intervalMs);

    void tick();
  }

  stop(): void {
    if (!this.poller) {
      return;
    }

    clearInterval(this.poller);
    this.poller = undefined;
  }

  async drainOnce(): Promise<Result<number>> {
    let processedJobs = 0;

    while (true) {
      const reserveResult = await this.inboundQueue.reserveNext();
      if (!reserveResult.ok) {
        return Err(reserveResult.error);
      }

      const job = reserveResult.value;
      if (!job) {
        break;
      }

      const command = createProcessIncomingMessageCommand(
        job.envelope.workspaceId,
        job.envelope.customerPhone.value,
        job.envelope.payload.text,
        job.envelope.externalMessageId,
        job.envelope.occurredAt,
      );

      const processResult = await this.commandBus.dispatch<string>(command);
      if (!processResult.ok) {
        const failResult = await this.inboundQueue.fail(
          job.jobId,
          processResult.error.message,
        );
        if (!failResult.ok) {
          return Err(failResult.error);
        }

        processedJobs += 1;
        continue;
      }

      const completeResult = await this.inboundQueue.complete(job.jobId);
      if (!completeResult.ok) {
        return Err(completeResult.error);
      }

      processedJobs += 1;
    }

    return Ok(processedJobs);
  }
}
