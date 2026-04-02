# ORQO - Infraestructura objetivo y despliegue rapido multi-tenant

Fecha: 2026-03-31
Estado: Propuesta tecnica ejecutable

## 1) Respuesta corta

No, **no todo debe correr en el mismo servidor de Vercel**.

Vercel es excelente para:
- Frontend (Landing, Dashboard)
- API liviana de control plane
- Deploys rapidos y previews

Pero para ORQO omnicanal transaccional se necesita ademas:
- Workers persistentes para colas y reintentos
- Runtime de orquestacion LLM (procesos de larga vida)
- Locking distribuido e idempotencia
- Procesamiento asincrono de webhooks de alto volumen

## 2) Estado actual (as-is)

En este repo:
- Landing: `Landing_Page/` (estatico, Vercel)
- Dashboard: `orqo-dashboard/` (Next.js + React + MongoDB, Vercel)
- Core: `orqo-core/` (Node.js + TypeScript, arquitectura limpia)

## 3) Arquitectura objetivo (to-be)

### 3.1 Capas

1. **Edge / Frontdoor**
- DNS + CDN + WAF (Cloudflare o equivalente)
- Enrutamiento por dominio y subdominio

2. **Control Plane (Vercel)**
- `orqo.io` (landing)
- `dashboard.orqo.io` (admin multi-tenant)
- APIs de gestion: agentes, config, reportes, usuarios, branding

3. **Data Plane (Compute persistente)**
- Servicio `orqo-core` en contenedores (Railway / Fly.io / Render / K8s)
- Endpoints webhook de canales
- Pipeline: validate -> normalize -> enqueue -> orchestrate -> deliver

4. **Messaging/Queue Plane**
- Cola durable (recomendado: Redis Streams/BullMQ o SQS + worker)
- Reintentos con backoff
- DLQ para mensajes fallidos

5. **Data Plane (Storage)**
- MongoDB Atlas (eventos, conversaciones, configuracion tenant)
- Redis (locks, dedupe temporal, rate limiting, cache)
- Object storage (S3/R2) para adjuntos

6. **Observabilidad**
- Logs estructurados + correlation id
- Metricas (latencia, errores, costo tokens)
- Alertas por rol (operaciones/owner)

### 3.2 Diagrama logico

```text
Canales externos -> Webhooks (Core) -> Queue -> Orquestacion LLM -> Entrega Canal
                         |                 |            |               |
                         |                 |            +-> Logs/Tracing|
                         +-> Mongo (event) +-> DLQ      +-> Alertas ----+

Dashboard (Vercel) <---------------------------------> APIs Control Plane
```

## 4) Donde corre cada hito

### Hito 1 - Conectores confiables
- Core + workers: compute persistente (no Vercel)
- Dashboard y UI de monitoreo: Vercel

### Hito 2 - Estado AI-first
- Persistencia eventos/hilos: Mongo Atlas
- Context snapshots: Mongo + cache Redis

### Hito 3 - Policy + Reasoning
- Router de modelos y fallback: Core compute persistente
- Configuracion de politicas: Dashboard Vercel

### Hito 4 - Operacion enterprise
- Dashboards operativos: Vercel
- Pipelines y alertas: Core + stack de observabilidad

## 5) Multi-tenant: un dashboard por cliente sin desplegar uno nuevo

Recomendacion principal:
- **Un solo deployment compartido** de dashboard
- Aislamiento logico por `tenant_id`
- Branding y configuracion por tenant
- Subdominios por cliente (`acme.dashboard.orqo.io`) con wildcard DNS

Ventajas:
- Provisionar cliente en minutos
- Costo bajo
- Menos mantenimiento

Cuando usar tenant dedicado:
- Requisitos regulatorios estrictos
- Alto volumen enterprise
- Aislamiento contractual fuerte

## 6) Provisionamiento automatico en minutos

Objetivo: alta de un cliente sin tocar codigo ni hacer deploy manual.

Flujo recomendado:
1. Crear `tenant` en DB
2. Crear owner user + roles base
3. Generar claves (`widget key`, `agent token`, API keys internas)
4. Cargar plantilla inicial (agente default, canales, alertas, branding)
5. Crear subdominio y SSL (wildcard preconfigurado o API DNS)
6. Ejecutar health checks
7. Enviar correo de activacion con acceso

Tiempo objetivo:
- Provision normal: 2 a 5 minutos
- Con validaciones externas: 5 a 10 minutos

## 7) Stack recomendado por entorno

### 7.1 DEV
- Vercel Preview (UI)
- Core en Railway/Fly dev
- Mongo Atlas dev cluster
- Redis dev

### 7.2 STAGING
- Vercel staging branch
- Core staging con workers paralelos
- DB staging separada
- Pruebas de carga y caos

### 7.3 PROD
- Vercel prod
- Core prod (2+ replicas min)
- Queue durable prod
- Mongo Atlas prod (backups + alertas)
- Redis HA

## 8) Recomendacion de CI/CD para velocidad

- Monorepo con pipelines por carpeta (`Landing_Page`, `orqo-dashboard`, `orqo-core`)
- Deploy automatico por merge a `main`
- Preview por PR
- Infra as Code (Terraform) para reproducibilidad
- Migraciones versionadas y rollback plan

## 9) Transaccionalidad y alto volumen

Controles minimos obligatorios:
- Idempotencia por `channel+provider+external_message_id`
- Locks distribuidos por conversacion/hilo
- Retry exponential + DLQ
- Outbox pattern para entrega saliente
- Correlation ID por mensaje end-to-end

SLO sugeridos:
- ACK webhook p95 < 250ms
- Perdida de eventos = 0
- Duplicados < 0.1%
- Exito de entrega > 99%

## 10) Decision practica para ORQO (recomendada)

Mantener:
- Vercel para Landing y Dashboard

Agregar:
- `orqo-core` en compute persistente con autoscaling
- Queue dedicada
- Redis para locks y dedupe
- Observabilidad completa

Con este modelo, abrir un cliente nuevo se vuelve un flujo automatizado de datos/configuracion, no un proyecto de infraestructura.

## 11) Plan de accion inmediato (2 semanas)

1. Definir contrato `CanonicalMessageEnvelope v1`
2. Implementar `orqo-core` webhook ingress + queue + worker base
3. Integrar Redis para dedupe/locks
4. Crear `tenant provisioning service` (script/API)
5. Agregar tablero de salud operacional en dashboard
6. Ejecutar prueba de carga con 3 canales activos

---

Autor: ORQO Architecture Track
