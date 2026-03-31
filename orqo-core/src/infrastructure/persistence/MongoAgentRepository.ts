import type { Collection, Db } from 'mongodb';
import type { IAgentRepository } from '../../application/ports/IAgentRepository.js';
import { Agent } from '../../domain/agent/entities/Agent.js';

interface AgentDoc {
  _id: string;
  workspaceId: string;
  name: string;
  systemPrompt: string;
  enabledSkillIds: string[];
  interactionLimit: number;
  active: boolean;
}

export class MongoAgentRepository implements IAgentRepository {
  private readonly col: Collection<AgentDoc>;

  constructor(db: Db) {
    this.col = db.collection<AgentDoc>('agents');
  }

  async findById(id: string): Promise<Agent | null> {
    const doc = await this.col.findOne({ _id: id });
    return doc ? this.toDomain(doc) : null;
  }

  async findActiveByWorkspace(workspaceId: string): Promise<Agent | null> {
    const doc = await this.col.findOne({ workspaceId, active: true });
    return doc ? this.toDomain(doc) : null;
  }

  async save(agent: Agent): Promise<void> {
    const doc: AgentDoc = {
      _id: agent.id,
      workspaceId: agent.workspaceId,
      name: agent.name,
      systemPrompt: agent.systemPrompt,
      enabledSkillIds: agent.enabledSkillIds,
      interactionLimit: agent.interactionLimit,
      active: agent.active,
    };
    await this.col.replaceOne({ _id: doc._id }, doc, { upsert: true });
  }

  private toDomain(doc: AgentDoc): Agent {
    return new Agent(
      doc._id,
      doc.workspaceId,
      doc.name,
      doc.systemPrompt,
      doc.enabledSkillIds,
      doc.interactionLimit,
      doc.active,
    );
  }
}
