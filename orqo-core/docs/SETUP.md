# Setup del proyecto

## Requisitos

- Node.js 20+
- npm 10+
- MongoDB local o remoto

## Variables de entorno

Usa [.env.example](/Users/jonat/source/repos/Orqo/orqo-core/.env.example) como base.

Variables principales:

- `PORT`
- `HEALTH_PORT`
- `MONGODB_URI`
- `MONGODB_DB`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_TOKEN`
- `WHATSAPP_PHONE_ID`
- `ANTHROPIC_API_KEY`
- `INBOUND_WORKER_POLL_MS`
- `INBOUND_QUEUE_MAX_ATTEMPTS`
- `INBOUND_QUEUE_LEASE_MS`
- `INBOUND_QUEUE_RETRY_BASE_MS`

## Comandos

```bash
npm install
npm run dev
```

Opcionales:

```bash
npm run dev:health
npm run typecheck
npm run test
npm run build
```

## Endpoints

- `GET /healthz`
- `GET /webhook/whatsapp`
- `POST /webhook/whatsapp`

## Notas operativas

- El webhook responde rápido y encola.
- El worker consume la cola persistente desde Mongo.
- Los fallos reintentan y luego pasan a `dead-letter`.
- El procesamiento adquiere lock por conversación.
