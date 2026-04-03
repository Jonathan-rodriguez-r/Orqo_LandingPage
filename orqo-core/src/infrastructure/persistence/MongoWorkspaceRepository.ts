import type { Db, Collection } from 'mongodb';
import { Ok, tryCatch, type Result } from '../../shared/Result.js';
import { Workspace, type WorkspaceStatus } from '../../domain/workspace/entities/Workspace.js';
import { ApiKey } from '../../domain/workspace/value-objects/ApiKey.js';
import { Branding } from '../../domain/workspace/value-objects/Branding.js';
import type { IWorkspaceRepository } from '../../application/ports/IWorkspaceRepository.js';

interface WorkspaceDoc {
  _id: string;
  name: string;
  status: WorkspaceStatus;
  apiKeyHash: string;
  apiKeyPrefix: string;
  branding: {
    agentName: string;
    logoUrl?: string;
    primaryColor?: string;
    welcomeMessage: string;
  };
  limits: {
    messagesPerMinute: number;
    maxActiveConversations: number;
  };
  plan: string;
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
  trialEndsAt?: Date;
}

function toWorkspace(doc: WorkspaceDoc): Workspace {
  const apiKey = ApiKey.fromHash(doc.apiKeyHash, doc.apiKeyPrefix);
  const brandingResult = Branding.create(doc.branding);
  // Si la branding en BD es inválida es un bug de datos — usamos default seguro
  const branding = brandingResult.ok
    ? brandingResult.value
    : Branding.default(doc.branding.agentName || doc.name);

  return Workspace.reconstitute({
    id: doc._id,
    name: doc.name,
    status: doc.status,
    apiKey,
    branding,
    limits: doc.limits,
    plan: doc.plan,
    timezone: doc.timezone,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    ...(doc.trialEndsAt !== undefined ? { trialEndsAt: doc.trialEndsAt } : {}),
  });
}

function toDoc(workspace: Workspace): WorkspaceDoc {
  return {
    _id: workspace.id,
    name: workspace.name,
    status: workspace.status,
    apiKeyHash: workspace.apiKey.hash,
    apiKeyPrefix: workspace.apiKey.prefix,
    branding: workspace.branding.toJSON(),
    limits: workspace.limits,
    plan: workspace.plan,
    timezone: workspace.timezone,
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
    ...(workspace.trialEndsAt !== undefined ? { trialEndsAt: workspace.trialEndsAt } : {}),
  };
}

export class MongoWorkspaceRepository implements IWorkspaceRepository {
  private readonly col: Collection<WorkspaceDoc>;

  constructor(db: Db) {
    this.col = db.collection<WorkspaceDoc>('workspaces');
  }

  async findById(workspaceId: string): Promise<Result<Workspace | null>> {
    return tryCatch(async () => {
      const doc = await this.col.findOne({ _id: workspaceId });
      return doc ? toWorkspace(doc) : null;
    });
  }

  async findByApiKeyHash(hash: string): Promise<Result<Workspace | null>> {
    return tryCatch(async () => {
      const doc = await this.col.findOne({ apiKeyHash: hash });
      return doc ? toWorkspace(doc) : null;
    });
  }

  async save(workspace: Workspace): Promise<Result<void>> {
    return tryCatch(async () => {
      const doc = toDoc(workspace);
      await this.col.replaceOne({ _id: workspace.id }, doc, { upsert: true });
    });
  }

  async list(filter?: { status?: string }): Promise<Result<Workspace[]>> {
    return tryCatch(async () => {
      const query = filter?.status ? { status: filter.status as WorkspaceStatus } : {};
      const docs = await this.col.find(query).sort({ createdAt: -1 }).toArray();
      return docs.map(toWorkspace);
    });
  }

  /** Crea índices necesarios — llamar una vez al arranque. */
  async ensureIndexes(): Promise<void> {
    await this.col.createIndex({ apiKeyHash: 1 }, { unique: true, sparse: true });
    await this.col.createIndex({ status: 1 });
    await this.col.createIndex({ createdAt: -1 });
  }
}
