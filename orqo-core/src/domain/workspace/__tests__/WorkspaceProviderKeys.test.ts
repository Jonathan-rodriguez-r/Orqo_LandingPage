import { randomBytes } from 'node:crypto';
import { WorkspaceProviderKeys } from '../entities/WorkspaceProviderKeys.js';
import { ProviderKey } from '../value-objects/ProviderKey.js';

const VALID_KEY = randomBytes(32).toString('hex');
const WORKSPACE_ID = 'ws-test-123';

describe('WorkspaceProviderKeys.create', () => {
  it('crea una entidad vacía', () => {
    const entity = WorkspaceProviderKeys.create(WORKSPACE_ID);
    expect(entity.workspaceId).toBe(WORKSPACE_ID);
    expect(entity.hasKey('anthropic')).toBe(false);
    expect(entity.hasKey('openai')).toBe(false);
    expect(Object.keys(entity.allPrefixes())).toHaveLength(0);
  });
});

describe('WorkspaceProviderKeys.withKey', () => {
  it('añade una key y devuelve nueva instancia', () => {
    const entity = WorkspaceProviderKeys.create(WORKSPACE_ID);
    const keyResult = ProviderKey.create('anthropic', 'sk-ant-api03-test', VALID_KEY);
    expect(keyResult.ok).toBe(true);
    if (!keyResult.ok) return;

    const updated = entity.withKey(keyResult.value);

    expect(updated.hasKey('anthropic')).toBe(true);
    expect(entity.hasKey('anthropic')).toBe(false); // original unchanged
  });

  it('reemplaza una key existente del mismo proveedor', () => {
    const entity = WorkspaceProviderKeys.create(WORKSPACE_ID);
    // "sk-ant-api03" = 12 chars (prefix of 'sk-ant-api03-first')
    const key1Result = ProviderKey.create('anthropic', 'sk-ant-api03-first', VALID_KEY);
    // "sk-ant-api03" = 12 chars (prefix of 'sk-ant-api03-second')
    const key2Result = ProviderKey.create('anthropic', 'sk-ant-api03-second', VALID_KEY);
    expect(key1Result.ok).toBe(true);
    expect(key2Result.ok).toBe(true);
    if (!key1Result.ok || !key2Result.ok) return;

    const withFirst = entity.withKey(key1Result.value);
    const withSecond = withFirst.withKey(key2Result.value);

    // prefix is first 12 chars: 'sk-ant-api03'
    expect(withSecond.getKey('anthropic')?.prefix).toBe('sk-ant-api03');
    // Both keys have same 12-char prefix because they share the same start, but the entity was replaced
    expect(withSecond.hasKey('anthropic')).toBe(true);
  });
});

describe('WorkspaceProviderKeys.withoutKey', () => {
  it('elimina una key y devuelve nueva instancia', () => {
    const keyResult = ProviderKey.create('openai', 'sk-openai-test-key', VALID_KEY);
    expect(keyResult.ok).toBe(true);
    if (!keyResult.ok) return;

    const entity = WorkspaceProviderKeys.create(WORKSPACE_ID).withKey(keyResult.value);
    expect(entity.hasKey('openai')).toBe(true);

    const updated = entity.withoutKey('openai');
    expect(updated.hasKey('openai')).toBe(false);
    expect(entity.hasKey('openai')).toBe(true); // original unchanged
  });

  it('no lanza si el proveedor no existe', () => {
    const entity = WorkspaceProviderKeys.create(WORKSPACE_ID);
    expect(() => entity.withoutKey('anthropic')).not.toThrow();
  });
});

describe('WorkspaceProviderKeys.hasKey', () => {
  it('retorna true si el proveedor tiene key', () => {
    const keyResult = ProviderKey.create('anthropic', 'sk-ant-api03-check', VALID_KEY);
    expect(keyResult.ok).toBe(true);
    if (!keyResult.ok) return;

    const entity = WorkspaceProviderKeys.create(WORKSPACE_ID).withKey(keyResult.value);
    expect(entity.hasKey('anthropic')).toBe(true);
    expect(entity.hasKey('openai')).toBe(false);
  });
});

describe('WorkspaceProviderKeys.allPrefixes', () => {
  it('retorna solo los proveedores configurados', () => {
    const keyResult = ProviderKey.create('anthropic', 'sk-ant-api03-prefix-test', VALID_KEY);
    expect(keyResult.ok).toBe(true);
    if (!keyResult.ok) return;

    const entity = WorkspaceProviderKeys.create(WORKSPACE_ID).withKey(keyResult.value);
    const prefixes = entity.allPrefixes();

    // prefix is first 12 chars: 'sk-ant-api03' (from 'sk-ant-api03-prefix-test')
    expect(prefixes['anthropic']).toBe('sk-ant-api03');
    expect('openai' in prefixes).toBe(false);
  });

  it('retorna todos los proveedores si están configurados', () => {
    const antKeyResult = ProviderKey.create('anthropic', 'sk-ant-api03-all', VALID_KEY);
    const oaiKeyResult = ProviderKey.create('openai', 'sk-openai-all-test', VALID_KEY);
    expect(antKeyResult.ok).toBe(true);
    expect(oaiKeyResult.ok).toBe(true);
    if (!antKeyResult.ok || !oaiKeyResult.ok) return;

    const entity = WorkspaceProviderKeys.create(WORKSPACE_ID)
      .withKey(antKeyResult.value)
      .withKey(oaiKeyResult.value);

    const prefixes = entity.allPrefixes();
    expect(Object.keys(prefixes)).toHaveLength(2);
    expect(prefixes['anthropic']).toBeDefined();
    expect(prefixes['openai']).toBeDefined();
  });
});

describe('WorkspaceProviderKeys.reconstitute', () => {
  it('reconstituyie la entidad desde la BD', () => {
    const updatedAt = new Date('2024-01-01');
    const plaintext = 'sk-ant-api03-reconstitute';
    const keyResult = ProviderKey.create('anthropic', plaintext, VALID_KEY);
    expect(keyResult.ok).toBe(true);
    if (!keyResult.ok) return;

    const entity = WorkspaceProviderKeys.reconstitute(
      WORKSPACE_ID,
      [keyResult.value],
      updatedAt,
    );

    expect(entity.workspaceId).toBe(WORKSPACE_ID);
    expect(entity.updatedAt).toEqual(updatedAt);
    expect(entity.hasKey('anthropic')).toBe(true);
  });
});

describe('WorkspaceProviderKeys.toJSON', () => {
  it('serializa correctamente la entidad', () => {
    const keyResult = ProviderKey.create('anthropic', 'sk-ant-api03-json-test', VALID_KEY);
    expect(keyResult.ok).toBe(true);
    if (!keyResult.ok) return;

    const entity = WorkspaceProviderKeys.create(WORKSPACE_ID).withKey(keyResult.value);
    const json = entity.toJSON();

    expect(json.workspaceId).toBe(WORKSPACE_ID);
    expect(json.keys).toHaveLength(1);
    expect(json.keys[0]?.provider).toBe('anthropic');
    // prefix is first 12 chars of 'sk-ant-api03-json-test'
    expect(json.keys[0]?.prefix).toBe('sk-ant-api03');
    expect(json.keys[0]?.encryptedValue).toBeTruthy();
  });
});

describe('ProviderKey.create', () => {
  it('retorna Err si el plaintext está vacío', () => {
    const result = ProviderKey.create('anthropic', '', VALID_KEY);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('vacía');
    }
  });

  it('retorna Err si el plaintext es solo espacios', () => {
    const result = ProviderKey.create('anthropic', '   ', VALID_KEY);
    expect(result.ok).toBe(false);
  });

  it('el prefix es los primeros 12 caracteres del plaintext', () => {
    const plaintext = 'sk-ant-api03-abcdefghijklmnop';
    const result = ProviderKey.create('anthropic', plaintext, VALID_KEY);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // 'sk-ant-api03-abcdefghijklmnop'.slice(0, 12) === 'sk-ant-api03'
      expect(result.value.prefix).toBe('sk-ant-api03');
      expect(result.value.prefix).toHaveLength(12);
    }
  });

  it('decrypt devuelve el plaintext original', () => {
    const plaintext = 'sk-ant-api03-decrypt-test-key';
    const result = ProviderKey.create('anthropic', plaintext, VALID_KEY);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.decrypt(VALID_KEY)).toBe(plaintext);
    }
  });
});
