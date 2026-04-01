import { Err, Ok, type Result } from '../../../shared/Result.js';
import { PhoneNumber } from '../../conversation/value-objects/PhoneNumber.js';

export type CanonicalChannel = 'whatsapp';
export type CanonicalProvider = 'meta';
export type CanonicalDirection = 'inbound';

export interface CanonicalTextPayload {
  readonly type: 'text';
  readonly text: string;
}

export interface CreateCanonicalMessageEnvelopeInput {
  readonly workspaceId: string;
  readonly providerAccountId: string;
  readonly externalMessageId: string;
  readonly customerPhone: string;
  readonly occurredAt: Date;
  readonly payload: CanonicalTextPayload;
  readonly correlationId?: string;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Contrato canónico de entrada al Core.
 * Traduce payloads de proveedores a un envelope estable e idempotente.
 */
export class CanonicalMessageEnvelope {
  readonly version = 'v1';
  readonly channel: CanonicalChannel = 'whatsapp';
  readonly provider: CanonicalProvider = 'meta';
  readonly direction: CanonicalDirection = 'inbound';
  readonly dedupeKey: string;

  private constructor(
    public readonly workspaceId: string,
    public readonly providerAccountId: string,
    public readonly externalMessageId: string,
    public readonly customerPhone: PhoneNumber,
    public readonly occurredAt: Date,
    public readonly payload: CanonicalTextPayload,
    public readonly correlationId: string,
    public readonly metadata: Readonly<Record<string, unknown>>,
  ) {
    this.dedupeKey = [
      this.channel,
      this.provider,
      this.workspaceId,
      this.externalMessageId,
    ].join(':');
  }

  static create(
    input: CreateCanonicalMessageEnvelopeInput,
  ): Result<CanonicalMessageEnvelope> {
    if (!input.workspaceId.trim()) {
      return Err(new Error('workspaceId es obligatorio'));
    }

    if (!input.providerAccountId.trim()) {
      return Err(new Error('providerAccountId es obligatorio'));
    }

    if (!input.externalMessageId.trim()) {
      return Err(new Error('externalMessageId es obligatorio'));
    }

    if (!(input.occurredAt instanceof Date) || Number.isNaN(input.occurredAt.getTime())) {
      return Err(new Error('occurredAt debe ser una fecha valida'));
    }

    const phoneResult = PhoneNumber.create(input.customerPhone);
    if (!phoneResult.ok) {
      return Err(phoneResult.error);
    }

    const text = input.payload.text.trim();
    if (!text) {
      return Err(new Error('El payload de texto no puede estar vacio'));
    }

    return Ok(
      new CanonicalMessageEnvelope(
        input.workspaceId.trim(),
        input.providerAccountId.trim(),
        input.externalMessageId.trim(),
        phoneResult.value,
        input.occurredAt,
        { type: 'text', text },
        input.correlationId?.trim() || crypto.randomUUID(),
        Object.freeze({ ...(input.metadata ?? {}) }),
      ),
    );
  }
}
