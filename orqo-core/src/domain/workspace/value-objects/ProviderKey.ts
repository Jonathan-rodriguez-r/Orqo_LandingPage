import { Ok, Err, type Result } from '../../../shared/Result.js';
import { encrypt, decrypt } from '../../../infrastructure/crypto/AesEncryption.js';

export type SupportedProvider = 'anthropic' | 'openai';

/**
 * Value object que representa una API key cifrada de un proveedor LLM.
 * Solo se almacena el valor cifrado; el plaintext nunca se persiste.
 */
export class ProviderKey {
  private constructor(
    public readonly provider: SupportedProvider,
    /** Valor cifrado en formato `iv_hex:authTag_hex:ciphertext_hex` */
    public readonly encryptedValue: string,
    /** Primeros 12 caracteres del plaintext, para mostrar en UI */
    public readonly prefix: string,
  ) {}

  /**
   * Crea un ProviderKey cifrando el plaintext.
   * Valida que el plaintext no esté vacío.
   */
  static create(
    provider: SupportedProvider,
    plaintext: string,
    encryptionKey: string,
  ): Result<ProviderKey> {
    if (!plaintext || plaintext.trim().length === 0) {
      return Err(new Error('La API key del proveedor no puede estar vacía'));
    }

    try {
      const encryptedValue = encrypt(plaintext, encryptionKey);
      const prefix = plaintext.slice(0, 12);
      return Ok(new ProviderKey(provider, encryptedValue, prefix));
    } catch (err) {
      return Err(err instanceof Error ? err : new Error(String(err)));
    }
  }

  /**
   * Reconstituye un ProviderKey desde la base de datos sin desencriptar.
   */
  static fromEncrypted(
    provider: SupportedProvider,
    encryptedValue: string,
    prefix: string,
  ): ProviderKey {
    return new ProviderKey(provider, encryptedValue, prefix);
  }

  /**
   * Desencripta y devuelve el plaintext de la API key.
   */
  decrypt(encryptionKey: string): string {
    return decrypt(this.encryptedValue, encryptionKey);
  }
}
