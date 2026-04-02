import { createHash, randomBytes } from 'node:crypto';
import { Err, Ok, type Result } from '../../../shared/Result.js';

/**
 * Value object que representa una API key de workspace.
 * Formato: `orqo_<32 bytes hex>` — 66 caracteres totales.
 * Solo se expone en texto plano al crear; después se almacena el hash SHA-256.
 */
export class ApiKey {
  private constructor(
    /** Hash SHA-256 del secret. Lo que se persiste en BD. */
    public readonly hash: string,
    /** Prefijo visible para identificación. */
    public readonly prefix: string,
  ) {}

  /** Genera una nueva API key. Devuelve tanto el objeto como el plaintext (solo al crear). */
  static generate(): { apiKey: ApiKey; plaintext: string } {
    const secret = randomBytes(32).toString('hex');
    const plaintext = `orqo_${secret}`;
    const hash = createHash('sha256').update(plaintext).digest('hex');
    const prefix = plaintext.slice(0, 12); // "orqo_" + 7 chars
    return { apiKey: new ApiKey(hash, prefix), plaintext };
  }

  /** Reconstruye desde un hash persistido (lectura desde BD). */
  static fromHash(hash: string, prefix: string): ApiKey {
    return new ApiKey(hash, prefix);
  }

  /** Verifica que un plaintext corresponde a esta key. */
  verify(plaintext: string): boolean {
    const hash = createHash('sha256').update(plaintext).digest('hex');
    return hash === this.hash;
  }

  /** Valida que un plaintext tiene el formato correcto antes de verificar. */
  static validate(plaintext: string): Result<void> {
    if (!/^orqo_[0-9a-f]{64}$/.test(plaintext)) {
      return Err(new Error('Formato de API key inválido'));
    }
    return Ok(undefined);
  }
}
