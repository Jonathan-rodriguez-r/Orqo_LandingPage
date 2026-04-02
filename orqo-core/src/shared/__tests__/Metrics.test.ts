import { Counter, Histogram, MetricsRegistry } from '../Metrics.js';

describe('Counter', () => {
  it('inicia en 0', () => {
    const c = new Counter('test_total', 'help', []);
    expect(c.value()).toBe(0);
  });

  it('incrementa correctamente', () => {
    const c = new Counter('test_total', 'help', ['status']);
    c.inc({ status: 'ok' });
    c.inc({ status: 'ok' });
    c.inc({ status: 'error' });
    expect(c.value({ status: 'ok' })).toBe(2);
    expect(c.value({ status: 'error' })).toBe(1);
  });

  it('incrementa by N', () => {
    const c = new Counter('test_total', 'help', []);
    c.inc({}, 5);
    expect(c.value()).toBe(5);
  });

  it('genera texto Prometheus correcto', () => {
    const c = new Counter('messages_total', 'Total mensajes', ['workspace']);
    c.inc({ workspace: 'ws-1' }, 3);
    const text = c.toPrometheusText();
    expect(text).toContain('# HELP messages_total Total mensajes');
    expect(text).toContain('# TYPE messages_total counter');
    expect(text).toContain('messages_total{workspace="ws-1"} 3');
  });

  it('reset() limpia todos los valores', () => {
    const c = new Counter('test_total', 'help', []);
    c.inc({}, 10);
    c.reset();
    expect(c.value()).toBe(0);
  });
});

describe('Histogram', () => {
  it('observe() registra el valor', () => {
    const h = new Histogram('latency', 'Latencia', [], [0.1, 0.5, 1]);
    h.observe({}, 0.3);
    const state = h.value();
    expect(state).toBeDefined();
    expect(state!.count).toBe(1);
    expect(state!.sum).toBeCloseTo(0.3);
  });

  it('distribuye correctamente en buckets', () => {
    const h = new Histogram('latency', 'Latencia', [], [0.1, 0.5, 1]);
    h.observe({}, 0.05);  // ≤ 0.1 ✓, ≤ 0.5 ✓, ≤ 1 ✓
    h.observe({}, 0.3);   // ≤ 0.5 ✓, ≤ 1 ✓
    h.observe({}, 0.8);   // ≤ 1 ✓

    const state = h.value()!;
    expect(state.counts[0]).toBe(1); // ≤ 0.1
    expect(state.counts[1]).toBe(2); // ≤ 0.5
    expect(state.counts[2]).toBe(3); // ≤ 1
    expect(state.counts[3]).toBe(3); // +Inf
    expect(state.count).toBe(3);
  });

  it('soporta labels múltiples', () => {
    const h = new Histogram('latency', 'Latencia', ['model'], [0.5]);
    h.observe({ model: 'gpt-4o' }, 0.2);
    h.observe({ model: 'claude' }, 1.5);

    expect(h.value({ model: 'gpt-4o' })!.count).toBe(1);
    expect(h.value({ model: 'claude' })!.count).toBe(1);
  });

  it('genera texto Prometheus con _bucket, _sum, _count', () => {
    const h = new Histogram('req_duration', 'Duración', [], [0.5, 1]);
    h.observe({}, 0.3);
    const text = h.toPrometheusText();
    expect(text).toContain('req_duration_bucket{le="0.5"} 1');
    expect(text).toContain('req_duration_bucket{le="+Inf"} 1');
    expect(text).toContain('req_duration_sum');
    expect(text).toContain('req_duration_count');
  });
});

describe('MetricsRegistry', () => {
  let registry: MetricsRegistry;

  beforeEach(() => {
    registry = new MetricsRegistry();
  });

  it('reutiliza el mismo counter por nombre', () => {
    const c1 = registry.counter('total', 'help');
    const c2 = registry.counter('total', 'help');
    expect(c1).toBe(c2);
  });

  it('reutiliza el mismo histogram por nombre', () => {
    const h1 = registry.histogram('latency', 'help');
    const h2 = registry.histogram('latency', 'help');
    expect(h1).toBe(h2);
  });

  it('toPrometheusText() incluye todos los counters e histograms', () => {
    registry.counter('req_total', 'Requests').inc({}, 5);
    registry.histogram('req_duration', 'Duración', [], [0.5]).observe({}, 0.2);
    const text = registry.toPrometheusText();
    expect(text).toContain('req_total');
    expect(text).toContain('req_duration');
  });

  it('reset() limpia todo', () => {
    registry.counter('total', 'help').inc({}, 10);
    registry.reset();
    const text = registry.toPrometheusText();
    expect(text.trim()).toBe('');
  });

  it('default singleton se reutiliza entre llamadas', () => {
    const r1 = MetricsRegistry.default;
    const r2 = MetricsRegistry.default;
    expect(r1).toBe(r2);
  });
});
