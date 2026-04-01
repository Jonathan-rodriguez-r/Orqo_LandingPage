# ORQO Core

Core de Orquestacion de ORQO.

Este proyecto es el runtime del data plane de ORQO: recibe eventos externos, los normaliza a un contrato canónico, los desacopla en una cola durable, protege el estado conversacional y orquesta la respuesta del agente.

## Estado actual

Base del proyecto creada y extendida hasta Hito 1 y Hito 2.

Incluye:

- Contrato `CanonicalMessageEnvelope v1`.
- Webhook de WhatsApp con normalizacion de payload.
- Cola persistente en Mongo con deduplicacion, retries y DLQ.
- Worker de ingreso desacoplado del webhook.
- Lock por conversación para evitar procesamiento concurrente.
- Snapshots de estado conversacional.
- Auditoría de eventos de conversación.
- Outbox de mensajes salientes.
- Composition root, health endpoint, tests y documentación.

## Pipeline actual

`validate -> normalize -> enqueue -> lock -> orchestrate -> persist -> outbox -> deliver -> audit -> snapshot`

## Hitos cubiertos

### Hito 0. Bootstrap

- Estructura del proyecto
- README, setup, arquitectura y roadmap
- Contrato canónico
- Entry points y composition root

### Hito 1. Ingress confiable

- Cola persistente en Mongo
- Idempotencia por `dedupeKey`
- ACK temprano del webhook
- Reintentos con backoff
- Dead-letter state
- Outbox básico para salida

### Hito 2. Estado conversacional robusto

- Lock por conversación
- Snapshots de conversación
- Auditoría de eventos por workspace
- Persistencia operacional en colecciones dedicadas

## Estructura

```text
orqo-core/
  docs/
    ARCHITECTURE.md
    SETUP.md
  src/
    application/
    domain/
    entrypoints/
    infrastructure/
    shared/
    types/
  .env.example
  jest.config.cjs
  package.json
  ROADMAP.md
  tsconfig.json
```

## Arranque local

1. Instala dependencias en [package.json](/Users/jonat/source/repos/Orqo/orqo-core/package.json).
2. Configura variables desde [.env.example](/Users/jonat/source/repos/Orqo/orqo-core/.env.example).
3. Levanta MongoDB local o apunta a Atlas.
4. Ejecuta `npm run dev` dentro de `orqo-core/`.

Scripts:

- `npm run dev`
- `npm run dev:health`
- `npm run typecheck`
- `npm run test`
- `npm run build`

## Documentacion

- Arquitectura: [ARCHITECTURE.md](/Users/jonat/source/repos/Orqo/orqo-core/docs/ARCHITECTURE.md)
- Setup: [SETUP.md](/Users/jonat/source/repos/Orqo/orqo-core/docs/SETUP.md)
- Roadmap: [ROADMAP.md](/Users/jonat/source/repos/Orqo/orqo-core/ROADMAP.md)

## Siguiente salto recomendado

El siguiente paso natural es Hito 3: router de modelos, políticas por tenant, presupuestos y tool calling gobernado.
