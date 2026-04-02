/**
 * Registro de métricas compatible con el formato de texto de Prometheus.
 *
 * Soporta:
 * - Counters: valores monotónicamente crecientes.
 * - Histograms: distribución de valores con buckets configurables.
 *
 * Uso:
 *   const reg = MetricsRegistry.default;
 *   reg.counter('messages_processed_total', 'Total mensajes procesados', ['workspace', 'status'])
 *      .inc({ workspace: 'ws-1', status: 'success' });
 *
 *   reg.histogram('llm_latency_seconds', 'Latencia LLM', ['model'])
 *      .observe({ model: 'claude-sonnet-4-6' }, 0.42);
 *
 *   const text = reg.toPrometheusText(); // → string para exponer en /metrics
 */

type Labels = Record<string, string>;

function serializeLabels(labels: Labels): string {
  const pairs = Object.entries(labels)
    .map(([k, v]) => `${k}="${v}"`)
    .join(',');
  return pairs ? `{${pairs}}` : '';
}

// ── Counter ──────────────────────────────────────────────────────────────────

export class Counter {
  private readonly values = new Map<string, number>();

  constructor(
    readonly name: string,
    readonly help: string,
    readonly labelNames: string[],
  ) {}

  inc(labels: Labels = {}, by = 1): void {
    const key = serializeLabels(labels);
    this.values.set(key, (this.values.get(key) ?? 0) + by);
  }

  value(labels: Labels = {}): number {
    return this.values.get(serializeLabels(labels)) ?? 0;
  }

  toPrometheusText(): string {
    const lines: string[] = [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} counter`,
    ];
    for (const [labelStr, count] of this.values) {
      lines.push(`${this.name}${labelStr} ${count}`);
    }
    return lines.join('\n');
  }

  reset(): void { this.values.clear(); }
}

// ── Histogram ─────────────────────────────────────────────────────────────────

const DEFAULT_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

interface BucketState {
  counts: number[];   // índice sincronizado con buckets (+Inf al final)
  sum: number;
  count: number;
}

export class Histogram {
  private readonly buckets: number[];
  private readonly states = new Map<string, BucketState>();

  constructor(
    readonly name: string,
    readonly help: string,
    readonly labelNames: string[],
    buckets: number[] = DEFAULT_BUCKETS,
  ) {
    this.buckets = [...buckets].sort((a, b) => a - b);
  }

  observe(labels: Labels = {}, value: number): void {
    const key = serializeLabels(labels);
    if (!this.states.has(key)) {
      this.states.set(key, {
        counts: new Array(this.buckets.length + 1).fill(0) as number[],
        sum: 0,
        count: 0,
      });
    }
    const state = this.states.get(key)!;
    state.sum += value;
    state.count += 1;
    for (let i = 0; i < this.buckets.length; i++) {
      if (value <= this.buckets[i]!) {
        state.counts[i]! += 1;
      }
    }
    // +Inf bucket siempre incrementa
    state.counts[this.buckets.length]! += 1;
  }

  value(labels: Labels = {}): BucketState | undefined {
    return this.states.get(serializeLabels(labels));
  }

  toPrometheusText(): string {
    const lines: string[] = [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} histogram`,
    ];
    for (const [labelStr, state] of this.states) {
      const base = labelStr ? labelStr.slice(0, -1) : '{'; // abre llave
      for (let i = 0; i < this.buckets.length; i++) {
        const le = this.buckets[i]!.toString();
        const lePart = labelStr
          ? `${labelStr.slice(0, -1)},le="${le}"}`
          : `{le="${le}"}`;
        lines.push(`${this.name}_bucket${lePart} ${state.counts[i]}`);
      }
      const infPart = labelStr
        ? `${base},le="+Inf"}`
        : `{le="+Inf"}`;
      lines.push(`${this.name}_bucket${infPart} ${state.counts[this.buckets.length]}`);
      lines.push(`${this.name}_sum${labelStr} ${state.sum}`);
      lines.push(`${this.name}_count${labelStr} ${state.count}`);
    }
    return lines.join('\n');
  }

  reset(): void { this.states.clear(); }
}

// ── Registry ─────────────────────────────────────────────────────────────────

export class MetricsRegistry {
  private static _default: MetricsRegistry | undefined;

  private readonly counters   = new Map<string, Counter>();
  private readonly histograms = new Map<string, Histogram>();

  static get default(): MetricsRegistry {
    MetricsRegistry._default ??= new MetricsRegistry();
    return MetricsRegistry._default;
  }

  /** Sólo para tests — resetea el singleton. */
  static resetDefault(): void {
    MetricsRegistry._default = undefined;
  }

  counter(name: string, help: string, labelNames: string[] = []): Counter {
    if (!this.counters.has(name)) {
      this.counters.set(name, new Counter(name, help, labelNames));
    }
    return this.counters.get(name)!;
  }

  histogram(
    name: string,
    help: string,
    labelNames: string[] = [],
    buckets?: number[],
  ): Histogram {
    if (!this.histograms.has(name)) {
      this.histograms.set(name, new Histogram(name, help, labelNames, buckets));
    }
    return this.histograms.get(name)!;
  }

  toPrometheusText(): string {
    const parts: string[] = [];
    for (const c of this.counters.values()) {
      parts.push(c.toPrometheusText());
    }
    for (const h of this.histograms.values()) {
      parts.push(h.toPrometheusText());
    }
    return parts.join('\n\n') + '\n';
  }

  reset(): void {
    this.counters.clear();
    this.histograms.clear();
  }
}
