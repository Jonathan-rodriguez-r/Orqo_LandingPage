import { createProcessIncomingMessageCommand } from '../../application/commands/process-message/ProcessIncomingMessageCommand.js';
import type { IInboundMessageQueue } from '../../application/ports/IInboundMessageQueue.js';
import type { ICommandBus } from '../../shared/CommandBus.js';
import { Err, Ok, type Result } from '../../shared/Result.js';
import type { ILogger } from '../../shared/Logger.js';
import { NoopLogger } from '../../shared/Logger.js';
import { MetricsRegistry } from '../../shared/Metrics.js';
import type { WorkspaceGuard } from '../../application/services/WorkspaceGuard.js';
import { WorkspaceRateLimiter } from './WorkspaceRateLimiter.js';

/**
 * Worker bootstrap que conecta el ingress canónico con el caso de uso actual.
 */
export class InboundMessageWorker {
  private poller: NodeJS.Timeout | undefined;
  private draining = false;
  private readonly jobsProcessed;
  private readonly drainErrors;
  private readonly rateLimitedTotal;
  private readonly rateLimiter: WorkspaceRateLimiter;

  constructor(
    private readonly commandBus: ICommandBus,
    private readonly inboundQueue: IInboundMessageQueue,
    private readonly logger: ILogger = new NoopLogger(),
    private readonly workspaceGuard?: WorkspaceGuard,
  ) {
    const metrics = MetricsRegistry.default;
    this.jobsProcessed = metrics.counter(
      'orqo_queue_jobs_processed_total',
      'Total de jobs procesados desde la cola de ingreso',
      ['status'],
    );
    this.drainErrors = metrics.counter(
      'orqo_queue_drain_errors_total',
      'Total de errores al drenar la cola de ingreso',
      [],
    );
    this.rateLimitedTotal = metrics.counter(
      'orqo_rate_limited_total',
      'Total de jobs rechazados por rate limit de workspace',
      ['workspace'],
    );
    this.rateLimiter = new WorkspaceRateLimiter();
  }

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
          this.logger.error('Error drenando cola de ingreso', {
            error: result.error.message,
          });
          this.drainErrors.inc();
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

      // Correlation ID: usamos el externalMessageId del envelope como trazabilidad end-to-end
      const correlationId = job.envelope.externalMessageId;
      const workspaceId = job.envelope.workspaceId;
      const jobLogger = this.logger.child({
        correlationId,
        jobId: job.jobId,
        workspaceId,
        attempts: job.attempts,
      });

      jobLogger.debug('Procesando job de cola');

      // ── Hito 5: Workspace guard — verifica que el workspace puede procesar ──
      if (this.workspaceGuard) {
        const guardResult = await this.workspaceGuard.canProcess(workspaceId);
        if (!guardResult.ok) {
          jobLogger.warn('Workspace no puede procesar mensajes — descartando job', {
            reason: guardResult.error.message,
          });
          const failResult = await this.inboundQueue.fail(job.jobId, guardResult.error.message);
          if (!failResult.ok) {
            return Err(failResult.error);
          }
          this.jobsProcessed.inc({ status: 'blocked' });
          processedJobs += 1;
          continue;
        }
      }

      // ── Hito 5: Rate limiting por workspace ─────────────────────────────────
      // Límite por defecto: 60 msgs/min. El guard ya validó el workspace.
      const allowed = this.rateLimiter.allow(workspaceId, 60);
      if (!allowed) {
        jobLogger.warn('Rate limit de workspace excedido — descartando job', { workspaceId });
        const failResult = await this.inboundQueue.fail(
          job.jobId,
          `Rate limit excedido para workspace ${workspaceId}`,
        );
        if (!failResult.ok) {
          return Err(failResult.error);
        }
        this.rateLimitedTotal.inc({ workspace: workspaceId });
        this.jobsProcessed.inc({ status: 'rate_limited' });
        processedJobs += 1;
        continue;
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
        jobLogger.warn('Job falló — marcando para reintento o DLQ', {
          error: processResult.error.message,
        });

        const failResult = await this.inboundQueue.fail(
          job.jobId,
          processResult.error.message,
        );
        if (!failResult.ok) {
          return Err(failResult.error);
        }

        this.jobsProcessed.inc({ status: 'error' });
        processedJobs += 1;
        continue;
      }

      const completeResult = await this.inboundQueue.complete(job.jobId);
      if (!completeResult.ok) {
        return Err(completeResult.error);
      }

      jobLogger.info('Job procesado exitosamente', { messageId: processResult.value });
      this.jobsProcessed.inc({ status: 'success' });
      processedJobs += 1;
    }

    return Ok(processedJobs);
  }
}
