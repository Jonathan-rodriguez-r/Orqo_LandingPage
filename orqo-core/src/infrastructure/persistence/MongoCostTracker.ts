import type { Db } from 'mongodb';
import type { ICostTracker, TokenUsageRecord } from '../../application/ports/ICostTracker.js';

/**
 * Tracker de uso de tokens y costos en MongoDB.
 * Colección: `token_usage`
 *
 * Índices recomendados (creados en ensureIndexes):
 *   - (workspaceId, dateUtc)  → consultas de presupuesto diario/mensual
 *   - recordedAt (TTL 90d)    → limpieza automática de registros viejos
 */
export class MongoCostTracker implements ICostTracker {
  private readonly col;
  private indexesEnsured = false;

  constructor(db: Db) {
    this.col = db.collection<TokenUsageRecord>('token_usage');
  }

  async ensureIndexes(): Promise<void> {
    if (this.indexesEnsured) return;
    await this.col.createIndexes([
      { key: { workspaceId: 1, dateUtc: 1 } },
      { key: { recordedAt: 1 }, expireAfterSeconds: 90 * 24 * 60 * 60 }, // TTL 90 días
    ]);
    this.indexesEnsured = true;
  }

  async record(usage: TokenUsageRecord): Promise<void> {
    await this.ensureIndexes();
    await this.col.insertOne(usage);
  }

  async getDailyUsageUsd(workspaceId: string, dateUtc: string): Promise<number> {
    await this.ensureIndexes();

    const result = await this.col
      .aggregate<{ total: number }>([
        { $match: { workspaceId, dateUtc } },
        { $group: { _id: null, total: { $sum: '$estimatedCostUsd' } } },
      ])
      .toArray();

    return result[0]?.total ?? 0;
  }

  async getMonthlyUsageUsd(workspaceId: string, yearMonthUtc: string): Promise<number> {
    await this.ensureIndexes();

    // yearMonthUtc = 'YYYY-MM', dateUtc = 'YYYY-MM-DD' → starts-with match
    const result = await this.col
      .aggregate<{ total: number }>([
        {
          $match: {
            workspaceId,
            dateUtc: { $regex: `^${yearMonthUtc}-` },
          },
        },
        { $group: { _id: null, total: { $sum: '$estimatedCostUsd' } } },
      ])
      .toArray();

    return result[0]?.total ?? 0;
  }
}
