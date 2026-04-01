import type { Collection, Db } from 'mongodb';
import type {
  ConversationLockLease,
  IConversationLockManager,
} from '../../application/ports/IConversationLockManager.js';
import { Err, Ok, type Result } from '../../shared/Result.js';

interface ConversationLockDoc {
  _id: string;
  workspaceId: string;
  key: string;
  ownerId: string;
  acquiredAt: Date;
  expiresAt: Date;
}

export class MongoConversationLockManager implements IConversationLockManager {
  private readonly col: Collection<ConversationLockDoc>;

  constructor(db: Db) {
    this.col = db.collection<ConversationLockDoc>('conversation_locks');
    void this.col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  }

  async acquire(
    workspaceId: string,
    key: string,
    ttlMs = 30_000,
  ): Promise<Result<ConversationLockLease>> {
    const lockId = `${workspaceId}:${key}`;
    const ownerId = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);

    try {
      await this.col.insertOne({
        _id: lockId,
        workspaceId,
        key,
        ownerId,
        acquiredAt: now,
        expiresAt,
      });

      return Ok({ lockId, ownerId, workspaceId, key, expiresAt });
    } catch (error) {
      const duplicate = error as { code?: number };
      if (duplicate.code !== 11000) {
        return Err(error instanceof Error ? error : new Error(String(error)));
      }

      const takeOver = await this.col.updateOne(
        {
          _id: lockId,
          expiresAt: { $lte: now },
        },
        {
          $set: {
            workspaceId,
            key,
            ownerId,
            acquiredAt: now,
            expiresAt,
          },
        },
      );

      if (takeOver.modifiedCount === 1) {
        return Ok({ lockId, ownerId, workspaceId, key, expiresAt });
      }

      return Err(new Error(`Lock ocupado para ${lockId}`));
    }
  }

  async release(lease: ConversationLockLease): Promise<void> {
    await this.col.deleteOne({
      _id: lease.lockId,
      ownerId: lease.ownerId,
    });
  }
}
