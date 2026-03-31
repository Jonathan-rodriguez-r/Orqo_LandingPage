import type { Conversation } from '../entities/Conversation.js';
import type { PhoneNumber } from '../value-objects/PhoneNumber.js';

/**
 * Puerto del repositorio — definido en el dominio, implementado en infraestructura.
 * La Application Layer solo conoce esta interfaz.
 */
export interface IConversationRepository {
  findById(id: string): Promise<Conversation | null>;
  findByPhone(workspaceId: string, phone: PhoneNumber): Promise<Conversation | null>;
  save(conversation: Conversation): Promise<void>;
  findRecent(workspaceId: string, limit?: number): Promise<Conversation[]>;
}
