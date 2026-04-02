# Roadmap de ORQO Core

## Hito 0. Bootstrap

Estado: completado

- Contrato `CanonicalMessageEnvelope v1`
- Webhook de WhatsApp
- Worker base
- README y documentación

## Hito 1. Ingress confiable

Estado: completado

- Cola persistente en Mongo
- Idempotencia por `dedupeKey`
- ACK rápido del webhook
- Reintentos con backoff
- Estado de dead-letter
- Outbox básico para salida

## Hito 2. Estado conversacional robusto

Estado: completado

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

## Hito 6. MCP Marketplace — onboarding en horas

Estado: completado (2026-04-02)

Registro dinámico de servidores MCP por workspace desde MongoDB. Cero código nuevo
para conectar un cliente a WooCommerce, Shopify, Odoo, SAP o cualquier API REST.

- `WorkspaceMcpServer` entity: config de un servidor MCP por workspace (tipo, URL/command, credenciales)
- `IWorkspaceMcpRepository` port + `MongoWorkspaceMcpRepository` (colección `workspace_mcp_servers`)
- `WorkspaceMcpRegistry`: carga y cachea los MCPs de un workspace lazy al primer mensaje
- `HttpMcpGateway`: soporte SSE/HTTP para servidores MCP remotos (además de stdio)
- Catálogo de templates pre-configurados: WooCommerce, Shopify, REST genérico
- Management API extendida: CRUD de servidores MCP por workspace
- `ProvisionWorkspaceHandler` actualizado: acepta lista de MCP servers en el provisioning
- Seed script extendido: `--mcp woocommerce` aplica template con credenciales
- `AgentOrchestrationService` actualizado: carga MCPs desde `WorkspaceMcpRegistry` en lugar de SkillRegistry fija

## Hito 7. Integración dashboard ↔ core

Estado: completado (2026-04-02)

Conectar el dashboard Next.js con la Management API del core, eliminando el acceso directo a MongoDB desde el frontend.

- Cliente HTTP en el dashboard para llamar la Management API (puerto 3002)
- Provisioning de workspaces desde el onboarding del dashboard via `POST /workspaces`
- Activación / suspensión de workspaces desde el panel de administración
- Rotación de API key desde el dashboard (`POST /workspaces/:id/rotate-key`)
- UI para agregar/quitar servidores MCP por workspace (catálogo visual)
- Activity logs del dashboard alimentados desde los eventos del core (colección `conversation_audit`)
- Webhook URL dinámica por workspace visible en el dashboard
- Variables de entorno `CORE_MANAGEMENT_URL` en el dashboard para apuntar al core

## Hito 8. API Keys por workspace (multi-tenant real)

Estado: completado (2026-04-02)

Cada workspace gestiona sus propias credenciales de proveedores LLM. El core no tiene
keys globales; cada cliente trae las suyas (BYOK — Bring Your Own Key).

- `WorkspaceProviderKeys` value object: almacena keys cifradas con AES-256-GCM (clave en env del servidor)
- `IWorkspaceProviderKeysRepository` port + `MongoWorkspaceProviderKeysRepository`
- `ModelRouter` actualizado: lee keys del workspace en lugar de env vars globales; env vars solo como fallback en workspaces demo
- Management API: `PUT /workspaces/:id/provider-keys` y `GET /workspaces/:id/provider-keys` (devuelve solo prefijos, nunca la key completa)
- Dashboard UI: formulario en "Motor de Agentes" para configurar keys por proveedor
- Tests: cifrado/descifrado, rotación de keys, fallback a env vars

## Hito 9. Multi-canal de entrada (Meta completo + Widget)

Estado: completado (2026-04-02)

Normalizar los tres canales de Meta en el mismo webhook y formalizar el canal Web Widget.

- `CanonicalChannel` ampliado: `'whatsapp' | 'instagram' | 'facebook' | 'widget'`
- `CanonicalProvider` ampliado: `'meta' | 'web'`
- `MetaInstagramGateway` — normaliza eventos `instagram_messaging` del webhook de Meta
- `MetaMessengerGateway` — normaliza eventos `messages` de Facebook Messenger
- `WebWidgetGateway` — ingesta mensajes del widget embebido via API REST autenticada con workspace API key
- Webhook único `/webhook/meta` maneja los tres canales de Meta por `object` field
- `OutboundGateway` abstracción: cada canal sabe cómo enviar la respuesta de vuelta
- Tests de normalización para cada canal

## Hito 10. Plugins nativos (WooCommerce · PrestaShop · Shopify)

Estado: completado (2026-04-02)

Widgets instalables en un clic para las tres plataformas de ecommerce más usadas.

- **Widget.js v2**: versión independiente de plataforma, configurable con `data-workspace-id` y `data-channel`
- **Plugin WordPress/WooCommerce**: plugin PHP que inyecta el widget, página de configuración en wp-admin, autenticación automática con workspace ID
- **Módulo PrestaShop**: módulo nativo compatible con PS 1.7+/8.x, instalación desde back-office
- **App Shopify**: app pública en Shopify App Store (o privada), inyecta widget via ScriptTag API, configurable desde admin
- Cada plugin obtiene el `workspaceId` de su config y lo pasa al widget para identificar el canal
- API endpoint `POST /webhook/widget` en el core para recibir mensajes del widget

## Hito 11. Deploy en producción

Estado: pendiente

Llevar el core a un servidor real accesible desde Meta y desde el dashboard.

- `railway.json` con dos servicios: webhook (público) y management (privado)
- Script de arranque con índices MongoDB automáticos al iniciar
- Deploy en Railway con dominio propio (e.g. `api.orqo.io`)
- Configurar webhook en Meta Business Console apuntando a `https://api.orqo.io/webhook/meta`
- Variables de entorno de producción documentadas en `.env.example`
- Health check de Railway apuntando a `/healthz`
- Alertas básicas: email cuando `/healthz` retorna `unhealthy`

## Hito 12. Primer workspace real (beta)

Estado: pendiente

Validar el flujo completo con un cliente beta real, de principio a fin.

- Provisionar primer workspace con `scripts/seed-workspace.ts`
- Cliente configura sus keys de Anthropic/OpenAI desde el dashboard
- Configurar número de WhatsApp del cliente en Meta Business
- Conectar sus sistemas (WooCommerce / ERP) via MCP desde el dashboard en minutos
- Verificar recepción de mensajes, respuesta del agente y entrega por WhatsApp
- Medir latencia P95 real en `/metrics` y ajustar política de modelos si supera 5s
- Confirmar que los logs de conversación aparecen en el dashboard
- Documentar el proceso de onboarding como guía para siguientes clientes
