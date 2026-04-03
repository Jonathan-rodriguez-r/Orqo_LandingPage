import type { Db, Collection } from 'mongodb';
import { tryCatch, type Result } from '../../shared/Result.js';
import { WorkspaceMcpServer, type McpTemplateType } from '../../domain/workspace/entities/WorkspaceMcpServer.js';
import type { IWorkspaceMcpRepository } from '../../application/ports/IWorkspaceMcpRepository.js';

interface WorkspaceMcpServerDoc {
  _id: string;
  workspaceId: string;
  name: string;
  type: McpTemplateType;
  serverConfig: object;
  tools: object[];
  triggers: object[];
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function toDoc(s: WorkspaceMcpServer): WorkspaceMcpServerDoc {
  return {
    _id: s.id,
    workspaceId: s.workspaceId,
    name: s.name,
    type: s.type,
    serverConfig: s.serverConfig,
    tools: s.tools,
    triggers: s.triggers,
    active: s.active,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

function fromDoc(doc: WorkspaceMcpServerDoc): WorkspaceMcpServer {
  return WorkspaceMcpServer.reconstitute({
    id: doc._id,
    workspaceId: doc.workspaceId,
    name: doc.name,
    type: doc.type,
    serverConfig: doc.serverConfig as never,
    tools: doc.tools as never,
    triggers: doc.triggers as never,
    active: doc.active,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  });
}

export class MongoWorkspaceMcpRepository implements IWorkspaceMcpRepository {
  private readonly col: Collection<WorkspaceMcpServerDoc>;

  constructor(db: Db) {
    this.col = db.collection<WorkspaceMcpServerDoc>('workspace_mcp_servers');
  }

  async findById(id: string): Promise<Result<WorkspaceMcpServer | null>> {
    return tryCatch(async () => {
      const doc = await this.col.findOne({ _id: id });
      return doc ? fromDoc(doc) : null;
    });
  }

  async findByWorkspace(workspaceId: string): Promise<Result<WorkspaceMcpServer[]>> {
    return tryCatch(async () => {
      const docs = await this.col.find({ workspaceId }).sort({ createdAt: 1 }).toArray();
      return docs.map(fromDoc);
    });
  }

  async save(server: WorkspaceMcpServer): Promise<Result<void>> {
    return tryCatch(async () => {
      const doc = toDoc(server);
      await this.col.replaceOne({ _id: server.id }, doc, { upsert: true });
    });
  }

  async delete(id: string): Promise<Result<void>> {
    return tryCatch(async () => {
      await this.col.deleteOne({ _id: id });
    });
  }

  async ensureIndexes(): Promise<void> {
    await this.col.createIndex({ workspaceId: 1, active: 1 });
  }
}
