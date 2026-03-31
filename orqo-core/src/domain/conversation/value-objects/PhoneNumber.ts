import { Ok, Err, type Result } from '../../../shared/Result.js';

/**
 * Value Object: PhoneNumber.
 * Inmutable. Igualdad por valor, no por referencia.
 * Normaliza a solo dígitos (sin +, espacios, guiones).
 */
export class PhoneNumber {
  private constructor(public readonly value: string) {}

  static create(raw: string): Result<PhoneNumber> {
    const normalized = raw.replace(/\D/g, '');
    if (normalized.length < 7 || normalized.length > 15) {
      return Err(new Error(`PhoneNumber inválido: "${raw}"`));
    }
    return Ok(new PhoneNumber(normalized));
  }

  equals(other: PhoneNumber): boolean {
    return this.value === other.value;
  }

  /** Formato E.164 con + */
  toE164(): string {
    return `+${this.value}`;
  }

  toString(): string {
    return this.value;
  }
}
