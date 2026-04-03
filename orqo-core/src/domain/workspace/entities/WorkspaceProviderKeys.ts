import { type SupportedProvider, ProviderKey } from '../value-objects/ProviderKey.js';

/**
 * Entidad que agrupa las API keys cifradas de proveedores LLM para un workspace.
 * Inmutable: las mutaciones devuelven nuevas instancias.
 */
export class WorkspaceProviderKeys {
  private constructor(
    public readonly workspaceId: string,
    private readonly keys: ReadonlyMap<SupportedProvider, ProviderKey>,
    public readonly updatedAt: Date,
  ) {}

  /** Crea una entidad vacía (sin keys configuradas). */
  static create(workspaceId: string): WorkspaceProviderKeys {
    return new WorkspaceProviderKeys(workspaceId, new Map(), new Date());
  }

  /** Reconstituye la entidad desde la base de datos. */
  static reconstitute(
    workspaceId: string,
    keys: ProviderKey[],
    updatedAt: Date,
  ): WorkspaceProviderKeys {
    const map = new Map<SupportedProvider, ProviderKey>();
    for (const key of keys) {
      map.set(key.provider, key);
    }
    return new WorkspaceProviderKeys(workspaceId, map, updatedAt);
  }

  /** Devuelve una nueva instancia con la key añadida o reemplazada. */
  withKey(key: ProviderKey): WorkspaceProviderKeys {
    const newMap = new Map(this.keys);
    newMap.set(key.provider, key);
    return new WorkspaceProviderKeys(this.workspaceId, newMap, new Date());
  }

  /** Devuelve una nueva instancia sin la key del proveedor indicado. */
  withoutKey(provider: SupportedProvider): WorkspaceProviderKeys {
    const newMap = new Map(this.keys);
    newMap.delete(provider);
    return new WorkspaceProviderKeys(this.workspaceId, newMap, new Date());
  }

  /** Obtiene la key de un proveedor, o undefined si no está configurada. */
  getKey(provider: SupportedProvider): ProviderKey | undefined {
    return this.keys.get(provider);
  }

  /** Indica si hay una key configurada para el proveedor. */
  hasKey(provider: SupportedProvider): boolean {
    return this.keys.has(provider);
  }

  /**
   * Devuelve los prefijos visibles de cada proveedor configurado.
   * Solo incluye los proveedores que tienen key (patrón exactOptionalPropertyTypes).
   */
  allPrefixes(): Partial<Record<SupportedProvider, string>> {
    const result: Partial<Record<SupportedProvider, string>> = {};
    for (const [provider, key] of this.keys) {
      result[provider] = key.prefix;
    }
    return result;
  }

  toJSON(): {
    workspaceId: string;
    keys: Array<{ provider: string; encryptedValue: string; prefix: string }>;
    updatedAt: Date;
  } {
    return {
      workspaceId: this.workspaceId,
      keys: Array.from(this.keys.values()).map(k => ({
        provider: k.provider,
        encryptedValue: k.encryptedValue,
        prefix: k.prefix,
      })),
      updatedAt: this.updatedAt,
    };
  }
}
