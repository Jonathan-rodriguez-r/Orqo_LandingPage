/**
 * Base class para todos los Domain Events.
 * Los eventos se generan dentro de los Aggregates y se publican DESPUÉS
 * de persistir el estado (ver Conversation.pullDomainEvents()).
 */
export abstract class DomainEvent {
  public readonly eventId: string;
  public readonly occurredAt: Date;

  constructor(public readonly aggregateId: string) {
    this.eventId = crypto.randomUUID();
    this.occurredAt = new Date();
  }

  /** Nombre único del evento. Usado como clave de subscripción en el EventBus. */
  abstract get eventName(): string;
}
