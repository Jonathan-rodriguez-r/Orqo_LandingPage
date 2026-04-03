/**
 * Utilidad de cifrado AES-256-GCM para claves de proveedores LLM.
 * Usa el módulo `crypto` de Node.js (sin dependencias externas).
 *
 * Formato del ciphertext: `${iv_hex}:${authTag_hex}:${ciphertext_hex}`
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // 96-bit IV recommended for GCM
const KEY_BYTES = 32; // 256-bit key

/**
 * Encripta un plaintext con AES-256-GCM.
 * @param plaintext Texto a cifrar
 * @param keyHex Clave en hex (64 chars = 32 bytes)
 * @returns `${iv_hex}:${authTag_hex}:${ciphertext_hex}`
 */
export function encrypt(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Desencripta un ciphertext producido por `encrypt`.
 * @param ciphertext `${iv_hex}:${authTag_hex}:${ciphertext_hex}`
 * @param keyHex Clave en hex (64 chars = 32 bytes)
 * @returns Plaintext original
 */
export function decrypt(ciphertext: string, keyHex: string): string {
  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    throw new Error('Formato de ciphertext inválido: se esperan 3 partes separadas por ":"');
  }

  const [ivHex, authTagHex, encryptedHex] = parts as [string, string, string];
  const key = Buffer.from(keyHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encryptedData = Buffer.from(encryptedHex, 'hex');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Lee ORQO_ENCRYPTION_KEY del entorno y valida su longitud.
 * @throws Error si la variable no está definida o tiene longitud incorrecta
 */
export function getEncryptionKey(): string {
  const key = process.env['ORQO_ENCRYPTION_KEY'];
  if (!key) {
    throw new Error(
      'ORQO_ENCRYPTION_KEY no está definida. Genera una con: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }
  if (key.length !== KEY_BYTES * 2) {
    throw new Error(
      `ORQO_ENCRYPTION_KEY debe tener ${KEY_BYTES * 2} caracteres hex (${KEY_BYTES} bytes). Longitud actual: ${key.length}`,
    );
  }
  return key;
}
