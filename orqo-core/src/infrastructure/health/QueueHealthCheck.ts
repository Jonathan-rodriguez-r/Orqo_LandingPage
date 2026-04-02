import type { IInboundMessageQueue } from '../../application/ports/IInboundMessageQueue.js';
import type { IHealthCheck, HealthCheckResult } from './HealthChecker.js';

/**
 * Health check de la cola de ingreso.
 *
 * - healthy   → DLQ = 0
 * - degraded  → DLQ > 0 pero < deadLetterUnhealthyThreshold
 * - unhealthy → DLQ >= deadLetterUnhealthyThreshold
 */
export class QueueHealthCheck implements IHealthCheck {
  readonly name = 'inbound_queue';

  constructor(
    private readonly queue: IInboundMessageQueue,
    private readonly deadLetterUnhealthyThreshold = 10,
  ) {}

  async check(): Promise<HealthCheckResult> {
    const stats = await this.queue.stats();

    let status: HealthCheckResult['status'] = 'healthy';
    if (stats.deadLetter >= this.deadLetterUnhealthyThreshold) {
      status = 'unhealthy';
    } else if (stats.deadLetter > 0) {
      status = 'degraded';
    }

    return {
      status,
      latencyMs: 0, // actualizado por HealthChecker
      details: {
        pending: stats.pending,
        processing: stats.processing,
        deadLetter: stats.deadLetter,
        deadLetterUnhealthyThreshold: this.deadLetterUnhealthyThreshold,
      },
    };
  }
}
