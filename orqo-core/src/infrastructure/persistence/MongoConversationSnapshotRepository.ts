import type { Collection, Db } from 'mongodb';
import type {
  ConversationStateSnapshot,
  IConversationSnapshotRepository,
} from '../../application/ports/IConversationSnapshotRepository.js';

interface ConversationSnapshotDoc extends ConversationStateSnapshot {
  _id: string;
}

export class MongoConversationSnapshotRepository
  implements IConversationSnapshotRepository
{
  private readonly col: Collection<ConversationSnapshotDoc>;

  constructor(db: Db) {
    this.col = db.collection<ConversationSnapshotDoc>('conversation_snapshots');
    void this.col.createIndex({ workspaceId: 1, updatedAt: -1 });
  }

  async save(snapshot: ConversationStateSnapshot): Promise<void> {
    await this.col.updateOne(
      { _id: snapshot.conversationId },
      {
        $set: {
          ...snapshot,
        },
        $setOnInsert: {
          _id: snapshot.conversationId,
        },
      },
      { upsert: true },
    );
  }
}
