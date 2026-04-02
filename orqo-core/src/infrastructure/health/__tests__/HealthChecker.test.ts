import { HealthChecker, type IHealthCheck, type HealthCheckResult } from '../HealthChecker.js';

function makeCheck(
  name: string,
  result: HealthCheckResult | Error,
): IHealthCheck {
  return {
    name,
    check: jest.fn().mockImplementation(async () => {
      if (result instanceof Error) throw result;
      return result;
    }),
  };
}

const healthy: HealthCheckResult = { status: 'healthy', latencyMs: 10 };
const degraded: HealthCheckResult = { status: 'degraded', latencyMs: 50, details: { dlq: 2 } };
const unhealthy: HealthCheckResult = { status: 'unhealthy', latencyMs: 5, error: 'Connection refused' };

describe('HealthChecker.run()', () => {
  it('retorna healthy si todos los checks son healthy', async () => {
    const checker = new HealthChecker([makeCheck('mongo', healthy), makeCheck('queue', healthy)]);
    const report = await checker.run();
    expect(report.status).toBe('healthy');
  });

  it('retorna degraded si algún check está degraded y ninguno unhealthy', async () => {
    const checker = new HealthChecker([makeCheck('mongo', healthy), makeCheck('queue', degraded)]);
    const report = await checker.run();
    expect(report.status).toBe('degraded');
  });

  it('retorna unhealthy si algún check está unhealthy', async () => {
    const checker = new HealthChecker([makeCheck('mongo', unhealthy), makeCheck('queue', degraded)]);
    const report = await checker.run();
    expect(report.status).toBe('unhealthy');
  });

  it('unhealthy tiene prioridad sobre degraded', async () => {
    const checker = new HealthChecker([makeCheck('a', degraded), makeCheck('b', unhealthy)]);
    const report = await checker.run();
    expect(report.status).toBe('unhealthy');
  });

  it('incluye los resultados individuales en el reporte', async () => {
    const checker = new HealthChecker([makeCheck('mongo', healthy), makeCheck('queue', degraded)]);
    const report = await checker.run();
    expect(report.checks['mongo']!.status).toBe('healthy');
    expect(report.checks['queue']!.status).toBe('degraded');
  });

  it('marca unhealthy si un check lanza excepción', async () => {
    const checker = new HealthChecker([makeCheck('mongo', new Error('Connection failed'))]);
    const report = await checker.run();
    expect(report.status).toBe('unhealthy');
    expect(report.checks['mongo']!.status).toBe('unhealthy');
    expect(report.checks['mongo']!.error).toContain('Connection failed');
  });

  it('incluye timestamp y uptimeSeconds', async () => {
    const checker = new HealthChecker([makeCheck('mongo', healthy)]);
    const report = await checker.run();
    expect(report.timestamp).toBeDefined();
    expect(typeof report.uptimeSeconds).toBe('number');
    expect(report.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('funciona sin checks (retorna healthy vacío)', async () => {
    const checker = new HealthChecker([]);
    const report = await checker.run();
    expect(report.status).toBe('healthy');
    expect(Object.keys(report.checks)).toHaveLength(0);
  });

  it('ejecuta todos los checks en paralelo (Promise.allSettled)', async () => {
    let order: string[] = [];
    const slowCheck: IHealthCheck = {
      name: 'slow',
      check: async () => {
        await new Promise(r => setTimeout(r, 20));
        order.push('slow');
        return healthy;
      },
    };
    const fastCheck: IHealthCheck = {
      name: 'fast',
      check: async () => {
        order.push('fast');
        return healthy;
      },
    };
    const checker = new HealthChecker([slowCheck, fastCheck]);
    await checker.run();
    // fast debería terminar antes que slow
    expect(order[0]).toBe('fast');
    expect(order[1]).toBe('slow');
  });
});
