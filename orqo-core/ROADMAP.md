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

Estado: completado

- Router de modelos (IModelRouter → ModelRouter)
- Políticas por tenant (ModelPolicy, MongoTenantPolicyRepository)
- Fallbacks por proveedor/modelo (FallbackLlmGateway — cadena ordenada)
- Presupuestos de costo (MongoCostTracker, CostEstimator — diario + mensual)
- Tool calling con guardrails (maxToolCallsPerTurn, toolTimeoutMs por política)
- OpenAI gateway (OpenAILlmGateway — sin SDK, fetch nativo)
- model y provider en LlmResponse para tracking de costos exacto

## Hito 4. Operacion enterprise

Estado: completado

- Logs estructurados (ILogger, StructuredLogger — JSON en prod, pretty en dev)
- Correlation IDs end-to-end (correlationId propagado worker→handler→logger child)
- Métricas Prometheus (MetricsRegistry — counters, histograms, /metrics endpoint)
  - orqo_webhook_requests_total, orqo_queue_jobs_processed_total
  - orqo_llm_calls_total, orqo_llm_latency_seconds
  - orqo_tool_calls_total, orqo_budget_exceeded_total
- Health checks avanzados (/healthz con MongoDB + Queue — healthy/degraded/unhealthy)
- Runbooks operativos (docs/runbooks/dlq-handling.md, docs/runbooks/high-latency.md)

## Hito 5. Plataforma multi-tenant

Estado: completado (2026-04-01)

- `Workspace` aggregate: lifecycle trial → active → suspended → cancelled
- `ApiKey` value object: generación con SHA-256, rotación, verificación
- `Branding` value object: agentName, logoUrl, primaryColor, welcomeMessage
- `IWorkspaceRepository` port + `MongoWorkspaceRepository` (colección `workspaces`)
- `ProvisionWorkspaceCommand` + `ProvisionWorkspaceHandler`: crea workspace + agente + política por defecto
- `WorkspaceGuard`: bloquea mensajes de workspaces suspendidos/cancelados/trial-expirado (fail-open en error de BD)
- `WorkspaceRateLimiter`: ventana deslizante en memoria, 60 msg/min por workspace
- `InboundMessageWorker`: integra guard + rate limiter, métricas `orqo_rate_limited_total`
- Management REST API (`src/entrypoints/management.ts`, puerto 3002): CRUD de workspaces + rotación de key
- Seed script (`scripts/seed-workspace.ts`): provisiona workspace desde CLI
- Container actualizado: wires workspace repo + guard al arranque
