import type { Agent } from '../../domain/agent/entities/Agent.js';

export interface IAgentRepository {
  findById(id: string): Promise<Agent | null>;
  findActiveByWorkspace(workspaceId: string): Promise<Agent | null>;
  save(agent: Agent): Promise<void>;
}
