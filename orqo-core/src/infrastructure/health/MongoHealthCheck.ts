import type { Db } from 'mongodb';
import type { IHealthCheck, HealthCheckResult } from './HealthChecker.js';

/**
 * Health check de MongoDB.
 * Emite un `ping` a la base de datos y mide la latencia.
 * Si el ping tarda más de `degradedThresholdMs`, reporta estado degraded.
 */
export class MongoHealthCheck implements IHealthCheck {
  readonly name = 'mongodb';

  constructor(
    private readonly db: Db,
    private readonly degradedThresholdMs = 200,
  ) {}

  async check(): Promise<HealthCheckResult> {
    const t0 = Date.now();
    await this.db.command({ ping: 1 });
    const latencyMs = Date.now() - t0;

    return {
      status: latencyMs > this.degradedThresholdMs ? 'degraded' : 'healthy',
      latencyMs,
      details: {
        databaseName: this.db.databaseName,
        latencyMs,
        degradedThresholdMs: this.degradedThresholdMs,
      },
    };
  }
}
