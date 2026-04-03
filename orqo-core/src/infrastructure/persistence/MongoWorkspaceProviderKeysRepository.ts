import type { Db } from 'mongodb';
import { Ok, tryCatch } from '../../shared/Result.js';
import type { Result } from '../../shared/Result.js';
import type { IWorkspaceProviderKeysRepository } from '../../application/ports/IWorkspaceProviderKeysRepository.js';
import { WorkspaceProviderKeys } from '../../domain/workspace/entities/WorkspaceProviderKeys.js';
import { ProviderKey, type SupportedProvider } from '../../domain/workspace/value-objects/ProviderKey.js';

interface ProviderKeyEntry {
  provider: string;
  encryptedValue: string;
  prefix: string;
}

interface ProviderKeysDoc {
  _id: string; // workspaceId
  keys: ProviderKeyEntry[];
  updatedAt: Date;
}

/**
 * Repositorio de API keys de proveedores por workspace en MongoDB.
 * Colección: `workspace_provider_keys`
 * Índice implícito en _id (workspaceId).
 */
export class MongoWorkspaceProviderKeysRepository implements IWorkspaceProviderKeysRepository {
  private readonly col;

  constructor(db: Db) {
    this.col = db.collection<ProviderKeysDoc>('workspace_provider_keys');
  }

  async findByWorkspaceId(workspaceId: string): Promise<Result<WorkspaceProviderKeys | null>> {
    return tryCatch(async () => {
      const doc = await this.col.findOne({ _id: workspaceId });
      if (!doc) return null;

      const keys = doc.keys.map(entry =>
        ProviderKey.fromEncrypted(
          entry.provider as SupportedProvider,
          entry.encryptedValue,
          entry.prefix,
        ),
      );

      return WorkspaceProviderKeys.reconstitute(workspaceId, keys, doc.updatedAt);
    });
  }

  async save(keys: WorkspaceProviderKeys): Promise<Result<void>> {
    return tryCatch(async () => {
      const { workspaceId, ...rest } = keys.toJSON();
      await this.col.replaceOne(
        { _id: workspaceId },
        rest as unknown as ProviderKeysDoc,
        { upsert: true },
      );
    });
  }
}
