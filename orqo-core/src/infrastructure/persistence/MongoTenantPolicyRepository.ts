import type { Db } from 'mongodb';
import type { ITenantPolicyRepository } from '../../application/ports/ITenantPolicyRepository.js';
import type { ModelPolicy } from '../../domain/policy/ModelPolicy.js';

interface ModelPolicyDoc extends Omit<ModelPolicy, 'workspaceId'> {
  _id: string; // workspaceId
}

/**
 * Repositorio de políticas de modelos en MongoDB.
 * Colección: `model_policies`
 * Índice implícito en _id (workspaceId).
 */
export class MongoTenantPolicyRepository implements ITenantPolicyRepository {
  private readonly col;

  constructor(db: Db) {
    this.col = db.collection<ModelPolicyDoc>('model_policies');
  }

  async findByWorkspaceId(workspaceId: string): Promise<ModelPolicy | null> {
    const doc = await this.col.findOne({ _id: workspaceId });
    if (!doc) return null;

    const { _id, ...rest } = doc;
    return { workspaceId: _id, ...rest };
  }

  async save(policy: ModelPolicy): Promise<void> {
    const { workspaceId, ...rest } = policy;
    // MongoDB driver's WithoutId<T> strips _id from the replacement body;
    // the _id is preserved automatically via the filter when upserting.
    await this.col.replaceOne(
      { _id: workspaceId },
      rest as unknown as ModelPolicyDoc,
      { upsert: true },
    );
  }
}
