export interface ConversationStateSnapshot {
  readonly conversationId: string;
  readonly workspaceId: string;
  readonly phoneNumber: string;
  readonly agentId: string;
  readonly messageCount: number;
  readonly lastUserMessage?: string;
  readonly lastAssistantMessage?: string;
  readonly lastSkillUsed?: string;
  readonly updatedAt: Date;
}

export interface IConversationSnapshotRepository {
  save(snapshot: ConversationStateSnapshot): Promise<void>;
}
