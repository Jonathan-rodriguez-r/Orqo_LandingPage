/**
 * Logger estructurado para ORQO Core.
 *
 * - En producción (NODE_ENV=production): emite JSON lines a stdout.
 * - En desarrollo: emite texto con nivel coloreado para legibilidad.
 * - Soporta child loggers con bindings pre-inyectados (correlation IDs, workspaceId, etc.).
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogContext = Record<string, unknown>;

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LEVEL_COLOR: Record<LogLevel, string> = {
  debug: '\x1b[36m', // cyan
  info:  '\x1b[32m', // green
  warn:  '\x1b[33m', // yellow
  error: '\x1b[31m', // red
};

const RESET = '\x1b[0m';

export interface ILogger {
  debug(message: string, ctx?: LogContext): void;
  info(message: string, ctx?: LogContext): void;
  warn(message: string, ctx?: LogContext): void;
  error(message: string, ctx?: LogContext): void;
  /** Crea un hijo con bindings pre-inyectados en cada mensaje. */
  child(bindings: LogContext): ILogger;
}

export class StructuredLogger implements ILogger {
  private readonly minLevel: number;

  constructor(
    private readonly service: string,
    private readonly bindings: LogContext = {},
    level: LogLevel = (process.env['LOG_LEVEL'] as LogLevel | undefined) ?? 'info',
    private readonly pretty: boolean = process.env['NODE_ENV'] !== 'production',
  ) {
    this.minLevel = LEVEL_PRIORITY[level];
  }

  debug(message: string, ctx?: LogContext): void { this.emit('debug', message, ctx); }
  info(message: string, ctx?: LogContext):  void { this.emit('info',  message, ctx); }
  warn(message: string, ctx?: LogContext):  void { this.emit('warn',  message, ctx); }
  error(message: string, ctx?: LogContext): void { this.emit('error', message, ctx); }

  child(bindings: LogContext): ILogger {
    return new StructuredLogger(
      this.service,
      { ...this.bindings, ...bindings },
      levelFromPriority(this.minLevel),
      this.pretty,
    );
  }

  private emit(level: LogLevel, message: string, ctx?: LogContext): void {
    if (LEVEL_PRIORITY[level] < this.minLevel) return;

    const entry = {
      level,
      timestamp: new Date().toISOString(),
      service: this.service,
      message,
      ...this.bindings,
      ...(ctx ?? {}),
    };

    if (this.pretty) {
      const color = LEVEL_COLOR[level];
      const lvl = level.toUpperCase().padEnd(5);
      const extras = { ...this.bindings, ...(ctx ?? {}) };
      const extrasStr = Object.keys(extras).length
        ? ' ' + JSON.stringify(extras)
        : '';
      process.stdout.write(
        `${color}${lvl}${RESET} [${entry.service}] ${entry.message}${extrasStr}\n`,
      );
    } else {
      process.stdout.write(JSON.stringify(entry) + '\n');
    }
  }
}

function levelFromPriority(p: number): LogLevel {
  return (Object.entries(LEVEL_PRIORITY).find(([, v]) => v === p)?.[0] as LogLevel) ?? 'info';
}

/** Logger de consola mudo para tests — no emite nada. */
export class NoopLogger implements ILogger {
  debug(_m: string, _c?: LogContext): void {}
  info(_m: string, _c?: LogContext):  void {}
  warn(_m: string, _c?: LogContext):  void {}
  error(_m: string, _c?: LogContext): void {}
  child(_b: LogContext): ILogger { return this; }
}

/** Fábrica para crear el logger raíz del servicio. */
export function createLogger(service: string): ILogger {
  return new StructuredLogger(service);
}
