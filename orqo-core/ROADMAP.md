# Roadmap de ORQO Core

## Hito 0. Bootstrap

Estado: completado

- Contrato `CanonicalMessageEnvelope v1`
- Webhook de WhatsApp
- Worker base
- README y documentación

## Hito 1. Ingress confiable

Estado: completado en base inicial

- Cola persistente en Mongo
- Idempotencia por `dedupeKey`
- ACK rápido del webhook
- Reintentos con backoff
- Estado de dead-letter
- Outbox básico para salida

## Hito 2. Estado conversacional robusto

Estado: completado en base inicial

- Locks por conversación
- Snapshots de estado
- Auditoría de eventos
- Persistencia operacional por colecciones

## Hito 3. Orquestacion AI-first

Estado: pendiente

- Router de modelos
- Políticas por tenant
- Fallbacks por proveedor/modelo
- Presupuestos de costo
- Tool calling con guardrails

## Hito 4. Operacion enterprise

Estado: pendiente

- Logs estructurados
- Correlation IDs end-to-end
- Métricas y alertas
- Health checks avanzados
- Runbooks operativos

## Hito 5. Plataforma multi-tenant

Estado: pendiente

- Provisioning automatizado
- Branding por tenant
- Subdominios y activación
- Seeds iniciales de agentes y skills
- Aislamiento operativo reforzado
