/**
 * MongoAuditLogger — ILogger wrapper que persiste WARN y ERROR a MongoDB.
 *
 * Escribe en la colección `audit_logs` con:
 *   category:    'core'
 *   workspaceId: 'orqo_platform'
 *
 * Esto permite que los logs de WARN/ERROR del core aparezcan en la tabla
 * "Logs & Auditoría" del dashboard, visible solo para usuarios globales de ORQO.
 *
 * DEBUG e INFO siguen solo a stdout (no saturar la BD con operacional).
 */

import { randomUUID } from 'node:crypto';
import type { Db } from 'mongodb';
import type { ILogger, LogContext } from './Logger.js';

const RETENTION_DAYS = 90;
const PLATFORM_WORKSPACE = 'orqo_platform';

export class MongoAuditLogger implements ILogger {
  constructor(
    private readonly inner: ILogger,
    private readonly db: Db,
    private readonly service: string,
    private readonly bindings: LogContext = {},
  ) {}

  debug(msg: string, ctx?: LogContext): void { this.inner.debug(msg, ctx); }
  info(msg: string, ctx?: LogContext): void  { this.inner.info(msg, ctx);  }

  warn(msg: string, ctx?: LogContext): void {
    this.inner.warn(msg, ctx);
    void this.persist('WARN', 'MEDIUM', msg, ctx);
  }

  error(msg: string, ctx?: LogContext): void {
    this.inner.error(msg, ctx);
    void this.persist('ERROR', 'HIGH', msg, ctx);
  }

  child(bindings: LogContext): ILogger {
    return new MongoAuditLogger(
      this.inner.child(bindings),
      this.db,
      this.service,
      { ...this.bindings, ...bindings },
    );
  }

  private async persist(
    level: 'WARN' | 'ERROR',
    severity: 'MEDIUM' | 'HIGH',
    message: string,
    ctx?: LogContext,
  ): Promise<void> {
    try {
      const now = new Date();
      const extra: Record<string, unknown> = { service: this.service, ...this.bindings };
      if (ctx) Object.assign(extra, ctx);

      await this.db.collection('audit_logs').insertOne({
        correlationId: (ctx?.['correlationId'] as string | undefined) ?? randomUUID(),
        level,
        severity,
        category: 'core',
        action: `CORE_${this.service.replace(/[^a-z0-9]+/gi, '_').toUpperCase()}`,
        message,
        workspaceId: (ctx?.['workspaceId'] as string | undefined) ?? PLATFORM_WORKSPACE,
        metadata: { extra },
        createdAt: now,
        expiresAt: new Date(now.getTime() + RETENTION_DAYS * 86_400_000),
      });
    } catch {
      // Never crash the caller due to logging failure
    }
  }
}
