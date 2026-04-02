import { randomUUID } from 'node:crypto';
import { Err, Ok, type Result } from '../../../shared/Result.js';
import { ApiKey } from '../value-objects/ApiKey.js';
import { Branding } from '../value-objects/Branding.js';

/**
 * Ciclo de vida de un workspace:
 *   trial → active   (por provisioning confirmado o pago)
 *   active → suspended (por falta de pago o acción manual)
 *   suspended → active (reactivación)
 *   * → cancelled     (eliminación lógica — no se borra en BD)
 */
export type WorkspaceStatus = 'trial' | 'active' | 'suspended' | 'cancelled';

export interface WorkspaceLimits {
  /** Máximo de mensajes por minuto aceptados para este workspace. Default: 60. */
  messagesPerMinute: number;
  /** Máximo de conversaciones activas simultáneas. Default: 500. */
  maxActiveConversations: number;
}

export interface WorkspaceProps {
  id: string;
  name: string;
  status: WorkspaceStatus;
  apiKey: ApiKey;
  branding: Branding;
  limits: WorkspaceLimits;
  /** Nombre del plan suscrito (e.g. 'starter', 'growth', 'enterprise'). */
  plan: string;
  /** Zona horaria IANA del workspace para reportes. Default: 'America/Bogota'. */
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
  /** Fecha en que el trial expira (solo en status=trial). */
  trialEndsAt?: Date;
}

export class Workspace {
  readonly id: string;
  readonly name: string;
  readonly status: WorkspaceStatus;
  readonly apiKey: ApiKey;
  readonly branding: Branding;
  readonly limits: WorkspaceLimits;
  readonly plan: string;
  readonly timezone: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly trialEndsAt: Date | undefined;

  private constructor(props: WorkspaceProps) {
    this.id = props.id;
    this.name = props.name;
    this.status = props.status;
    this.apiKey = props.apiKey;
    this.branding = props.branding;
    this.limits = props.limits;
    this.plan = props.plan;
    this.timezone = props.timezone;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    this.trialEndsAt = props.trialEndsAt;
  }

  /** Crea un workspace nuevo en estado trial. */
  static provision(params: {
    name: string;
    plan?: string;
    agentName?: string;
    timezone?: string;
    trialDays?: number;
  }): Result<{ workspace: Workspace; apiKeyPlaintext: string }> {
    if (!params.name.trim()) {
      return Err(new Error('name no puede estar vacío'));
    }
    if (params.name.length > 128) {
      return Err(new Error('name excede 128 caracteres'));
    }

    const { apiKey, plaintext: apiKeyPlaintext } = ApiKey.generate();
    const agentName = params.agentName ?? params.name;
    const branding = Branding.default(agentName);
    const now = new Date();
    const trialDays = params.trialDays ?? 14;

    const workspace = new Workspace({
      id: randomUUID(),
      name: params.name.trim(),
      status: 'trial',
      apiKey,
      branding,
      limits: { messagesPerMinute: 60, maxActiveConversations: 500 },
      plan: params.plan ?? 'starter',
      timezone: params.timezone ?? 'America/Bogota',
      createdAt: now,
      updatedAt: now,
      trialEndsAt: new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1_000),
    });

    return Ok({ workspace, apiKeyPlaintext });
  }

  /** Reconstruye desde datos persistidos. */
  static reconstitute(props: WorkspaceProps): Workspace {
    return new Workspace(props);
  }

  /** ¿Puede procesar mensajes en este momento? */
  get isOperational(): boolean {
    if (this.status === 'active') return true;
    if (this.status === 'trial') {
      return this.trialEndsAt === undefined || this.trialEndsAt > new Date();
    }
    return false;
  }

  activate(): Result<Workspace> {
    if (this.status === 'cancelled') {
      return Err(new Error('No se puede activar un workspace cancelado'));
    }
    // Eliminar trialEndsAt al activar — no pasar undefined explícitamente (exactOptionalPropertyTypes)
    const { trialEndsAt: _removed, ...rest } = this._toProps();
    return Ok(new Workspace({ ...rest, status: 'active', updatedAt: new Date() }));
  }

  suspend(): Result<Workspace> {
    if (this.status === 'cancelled') {
      return Err(new Error('No se puede suspender un workspace cancelado'));
    }
    return Ok(this._with({ status: 'suspended' }));
  }

  cancel(): Result<Workspace> {
    if (this.status === 'cancelled') {
      return Err(new Error('Workspace ya está cancelado'));
    }
    return Ok(this._with({ status: 'cancelled' }));
  }

  updateBranding(branding: Branding): Workspace {
    return this._with({ branding });
  }

  updateLimits(limits: Partial<WorkspaceLimits>): Workspace {
    return this._with({ limits: { ...this.limits, ...limits } });
  }

  rotateApiKey(): { workspace: Workspace; apiKeyPlaintext: string } {
    const { apiKey, plaintext: apiKeyPlaintext } = ApiKey.generate();
    return { workspace: this._with({ apiKey }), apiKeyPlaintext };
  }

  private _with(overrides: Partial<WorkspaceProps>): Workspace {
    return new Workspace({ ...this._toProps(), ...overrides, updatedAt: new Date() });
  }

  private _toProps(): WorkspaceProps {
    return {
      id: this.id,
      name: this.name,
      status: this.status,
      apiKey: this.apiKey,
      branding: this.branding,
      limits: this.limits,
      plan: this.plan,
      timezone: this.timezone,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      ...(this.trialEndsAt !== undefined ? { trialEndsAt: this.trialEndsAt } : {}),
    };
  }
}
