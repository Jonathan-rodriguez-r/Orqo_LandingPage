import type { Db } from 'mongodb';
import { tryCatch, type Result } from '../../shared/Result.js';
import type { IWorkspaceChannelConfigRepository } from '../../application/ports/IWorkspaceChannelConfigRepository.js';
import { WorkspaceChannelConfig } from '../../domain/workspace/entities/WorkspaceChannelConfig.js';

interface ChannelConfigDoc {
  _id: string; // workspaceId
  whatsapp?: { phoneNumberId: string; encryptedToken: string; tokenPrefix: string };
  instagram?: { igAccountId: string; encryptedToken: string; tokenPrefix: string };
  facebook?: { pageId: string; encryptedToken: string; tokenPrefix: string };
  updatedAt: Date;
}

/**
 * Repositorio de configuración de canales por workspace en MongoDB.
 * Colección: `workspace_channel_configs`
 */
export class MongoWorkspaceChannelConfigRepository implements IWorkspaceChannelConfigRepository {
  private readonly col;

  constructor(db: Db) {
    this.col = db.collection<ChannelConfigDoc>('workspace_channel_configs');
  }

  async ensureIndexes(): Promise<void> {
    await this.col.createIndex({ 'whatsapp.phoneNumberId': 1 }, { sparse: true, unique: true });
    await this.col.createIndex({ 'instagram.igAccountId': 1 }, { sparse: true, unique: true });
    await this.col.createIndex({ 'facebook.pageId': 1 }, { sparse: true, unique: true });
  }

  async findByWorkspaceId(workspaceId: string): Promise<Result<WorkspaceChannelConfig | null>> {
    return tryCatch(async () => {
      const doc = await this.col.findOne({ _id: workspaceId });
      if (!doc) return null;
      return this._docToEntity(doc);
    });
  }

  async findByPhoneNumberId(phoneNumberId: string): Promise<Result<WorkspaceChannelConfig | null>> {
    return tryCatch(async () => {
      const doc = await this.col.findOne({ 'whatsapp.phoneNumberId': phoneNumberId });
      if (!doc) return null;
      return this._docToEntity(doc);
    });
  }

  async findByIgAccountId(igAccountId: string): Promise<Result<WorkspaceChannelConfig | null>> {
    return tryCatch(async () => {
      const doc = await this.col.findOne({ 'instagram.igAccountId': igAccountId });
      if (!doc) return null;
      return this._docToEntity(doc);
    });
  }

  async findByPageId(pageId: string): Promise<Result<WorkspaceChannelConfig | null>> {
    return tryCatch(async () => {
      const doc = await this.col.findOne({ 'facebook.pageId': pageId });
      if (!doc) return null;
      return this._docToEntity(doc);
    });
  }

  async save(config: WorkspaceChannelConfig): Promise<Result<void>> {
    return tryCatch(async () => {
      const doc: ChannelConfigDoc = {
        _id: config.workspaceId,
        updatedAt: config.updatedAt,
        ...(config.whatsapp !== undefined ? { whatsapp: config.whatsapp } : {}),
        ...(config.instagram !== undefined ? { instagram: config.instagram } : {}),
        ...(config.facebook !== undefined ? { facebook: config.facebook } : {}),
      };
      const { _id, ...rest } = doc;
      await this.col.replaceOne(
        { _id },
        rest as unknown as ChannelConfigDoc,
        { upsert: true },
      );
    });
  }

  private _docToEntity(doc: ChannelConfigDoc): WorkspaceChannelConfig {
    return WorkspaceChannelConfig.reconstitute({
      workspaceId: doc._id,
      updatedAt: doc.updatedAt,
      ...(doc.whatsapp !== undefined ? { whatsapp: doc.whatsapp } : {}),
      ...(doc.instagram !== undefined ? { instagram: doc.instagram } : {}),
      ...(doc.facebook !== undefined ? { facebook: doc.facebook } : {}),
    });
  }
}
