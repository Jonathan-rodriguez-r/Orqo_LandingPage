import type {
  ConversationStateSnapshot,
} from '../ports/IConversationSnapshotRepository.js';
import type { Conversation } from '../../domain/conversation/entities/Conversation.js';

export function buildConversationStateSnapshot(
  conversation: Conversation,
  skillUsed?: string,
): ConversationStateSnapshot {
  const lastUserMessage = [...conversation.messages]
    .reverse()
    .find(message => message.role === 'user');
  const lastAssistantMessage = [...conversation.messages]
    .reverse()
    .find(message => message.role === 'assistant');

  return {
    conversationId: conversation.id,
    workspaceId: conversation.workspaceId,
    phoneNumber: conversation.phoneNumber.value,
    agentId: conversation.agentId,
    messageCount: conversation.messageCount,
    updatedAt: new Date(),
    ...(lastUserMessage ? { lastUserMessage: lastUserMessage.content } : {}),
    ...(lastAssistantMessage
      ? { lastAssistantMessage: lastAssistantMessage.content }
      : {}),
    ...(skillUsed ? { lastSkillUsed: skillUsed } : {}),
  };
}
