import { encrypt, decrypt, getEncryptionKey } from '../AesEncryption.js';
import { randomBytes } from 'node:crypto';

const VALID_KEY = randomBytes(32).toString('hex'); // 64 hex chars

describe('AesEncryption.encrypt / decrypt', () => {
  it('round-trip: decrypt(encrypt(plaintext)) === plaintext', () => {
    const plaintext = 'sk-ant-api03-test-key-12345';
    const ciphertext = encrypt(plaintext, VALID_KEY);
    const result = decrypt(ciphertext, VALID_KEY);
    expect(result).toBe(plaintext);
  });

  it('diferentes IVs producen ciphertexts distintos para el mismo plaintext', () => {
    const plaintext = 'sk-ant-api03-test-key';
    const c1 = encrypt(plaintext, VALID_KEY);
    const c2 = encrypt(plaintext, VALID_KEY);
    expect(c1).not.toBe(c2);
  });

  it('el ciphertext tiene formato iv:authTag:data (3 partes separadas por ":")', () => {
    const ciphertext = encrypt('test', VALID_KEY);
    const parts = ciphertext.split(':');
    expect(parts).toHaveLength(3);
    // Each part should be a non-empty hex string
    for (const part of parts) {
      expect(part.length).toBeGreaterThan(0);
      expect(/^[0-9a-f]+$/i.test(part)).toBe(true);
    }
  });

  it('decrypt lanza con una clave incorrecta', () => {
    const plaintext = 'sk-openai-test';
    const ciphertext = encrypt(plaintext, VALID_KEY);
    const wrongKey = randomBytes(32).toString('hex');
    expect(() => decrypt(ciphertext, wrongKey)).toThrow();
  });

  it('decrypt lanza con formato de ciphertext inválido', () => {
    expect(() => decrypt('invalid-ciphertext', VALID_KEY)).toThrow(
      'Formato de ciphertext inválido',
    );
  });

  it('cifra y descifra cadenas vacías', () => {
    const ciphertext = encrypt('', VALID_KEY);
    const result = decrypt(ciphertext, VALID_KEY);
    expect(result).toBe('');
  });

  it('cifra y descifra cadenas con caracteres especiales', () => {
    const plaintext = 'sk-ant-api03-超長いキー-🔑-test!@#$%';
    const ciphertext = encrypt(plaintext, VALID_KEY);
    const result = decrypt(ciphertext, VALID_KEY);
    expect(result).toBe(plaintext);
  });
});

describe('getEncryptionKey', () => {
  const original = process.env['ORQO_ENCRYPTION_KEY'];

  afterEach(() => {
    if (original !== undefined) {
      process.env['ORQO_ENCRYPTION_KEY'] = original;
    } else {
      delete process.env['ORQO_ENCRYPTION_KEY'];
    }
  });

  it('retorna la clave si ORQO_ENCRYPTION_KEY está definida con 64 chars', () => {
    process.env['ORQO_ENCRYPTION_KEY'] = VALID_KEY;
    expect(getEncryptionKey()).toBe(VALID_KEY);
  });

  it('lanza si ORQO_ENCRYPTION_KEY no está definida', () => {
    delete process.env['ORQO_ENCRYPTION_KEY'];
    expect(() => getEncryptionKey()).toThrow('ORQO_ENCRYPTION_KEY no está definida');
  });

  it('lanza si ORQO_ENCRYPTION_KEY tiene longitud incorrecta', () => {
    process.env['ORQO_ENCRYPTION_KEY'] = 'demasiado-corto';
    expect(() => getEncryptionKey()).toThrow('debe tener 64 caracteres hex');
  });
});
