import type { Result } from '../../shared/Result.js';

export interface ConversationLockLease {
  readonly lockId: string;
  readonly ownerId: string;
  readonly workspaceId: string;
  readonly key: string;
  readonly expiresAt: Date;
}

export interface IConversationLockManager {
  acquire(
    workspaceId: string,
    key: string,
    ttlMs?: number,
  ): Promise<Result<ConversationLockLease>>;
  release(lease: ConversationLockLease): Promise<void>;
}
