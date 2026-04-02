/**
 * Framework de health checks avanzados para ORQO Core.
 *
 * Cada check implementa `IHealthCheck` y reporta su estado individualmente.
 * El `HealthChecker` agrega todos los resultados y calcula el estado global:
 *   - healthy   → todos los checks son healthy
 *   - degraded  → al menos un check degradado, ninguno unhealthy
 *   - unhealthy → al menos un check unhealthy
 */

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface HealthCheckResult {
  status: HealthStatus;
  latencyMs: number;
  details?: Record<string, unknown>;
  error?: string;
}

export interface IHealthCheck {
  readonly name: string;
  check(): Promise<HealthCheckResult>;
}

export interface HealthReport {
  status: HealthStatus;
  checks: Record<string, HealthCheckResult>;
  uptimeSeconds: number;
  version: string;
  timestamp: string;
}

const startTime = Date.now();

export class HealthChecker {
  constructor(
    private readonly checks: IHealthCheck[],
    private readonly version = process.env['npm_package_version'] ?? '0.1.0',
  ) {}

  async run(): Promise<HealthReport> {
    const results = await Promise.allSettled(
      this.checks.map(check => this.runOne(check)),
    );

    const checksMap: Record<string, HealthCheckResult> = {};
    for (const [i, settled] of results.entries()) {
      const name = this.checks[i]!.name;
      if (settled.status === 'fulfilled') {
        checksMap[name] = settled.value;
      } else {
        checksMap[name] = {
          status: 'unhealthy',
          latencyMs: 0,
          error: String(settled.reason),
        };
      }
    }

    const statuses = Object.values(checksMap).map(r => r.status);
    const globalStatus: HealthStatus = statuses.includes('unhealthy')
      ? 'unhealthy'
      : statuses.includes('degraded')
        ? 'degraded'
        : 'healthy';

    return {
      status: globalStatus,
      checks: checksMap,
      uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
      version: this.version,
      timestamp: new Date().toISOString(),
    };
  }

  private async runOne(check: IHealthCheck): Promise<HealthCheckResult> {
    const t0 = Date.now();
    try {
      const result = await check.check();
      return { ...result, latencyMs: Date.now() - t0 };
    } catch (err) {
      return {
        status: 'unhealthy',
        latencyMs: Date.now() - t0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
