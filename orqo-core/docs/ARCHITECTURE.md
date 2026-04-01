# Arquitectura del ORQO Core

## Propósito

`orqo-core` es el runtime de orquestación de ORQO. Su misión es recibir eventos externos, estabilizarlos en contratos internos, proteger el estado conversacional y ejecutar el flujo operativo del agente.

## Pipeline actual

```text
Provider webhook
  -> Validation
  -> Normalization
  -> CanonicalMessageEnvelope
  -> Durable Queue
  -> Worker
  -> Conversation Lock
  -> Application Use Case
  -> Orchestration
  -> Persistence
  -> Outbox / Delivery
  -> Audit / Snapshot
```

## Hitos implementados

### Hito 1

- `MongoInboundMessageQueue` desacopla el webhook del procesamiento.
- La cola aplica deduplicación por `dedupeKey`.
- Los jobs fallidos reintentan con backoff y pasan a `dead-letter`.
- El webhook hace ACK inmediato y delega el trabajo al worker.

### Hito 2

- `MongoConversationLockManager` serializa el acceso por conversación.
- `MongoConversationSnapshotRepository` guarda el último estado útil.
- `MongoConversationAuditRepository` persiste el rastro de eventos.
- `MongoOutboundMessageOutbox` deja evidencia operacional de salida.

## Capas

### Domain

Modela agentes, conversaciones, skills y mensajería canónica.

### Application

Define casos de uso, puertos y reglas de coordinación.

### Infrastructure

Implementa Mongo, gateways, queue, worker, webhook y wiring.

### Shared

Contiene `Result`, buses, eventos y utilidades internas.

## Colecciones operacionales

- `conversations`
- `agents`
- `inbound_message_queue`
- `conversation_locks`
- `conversation_snapshots`
- `conversation_audit_log`
- `outbound_message_outbox`

## Riesgos todavía abiertos

- La cola durable vive en Mongo, pero aún no en Redis Streams/BullMQ.
- El outbox está persistido, pero no existe un dispatcher separado.
- Falta observabilidad avanzada y métricas.
- Falta provisioning multi-tenant automatizado.
