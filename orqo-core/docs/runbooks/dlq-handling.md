# Runbook: Dead-Letter Queue (DLQ)

## Síntomas

- `/healthz` retorna `status: "degraded"` con `inbound_queue.deadLetter > 0`
- `/healthz` retorna `status: "unhealthy"` con `inbound_queue.deadLetter >= 10`
- Métrica `orqo_queue_jobs_processed_total{status="error"}` creciendo

## Diagnóstico

### 1. Ver mensajes en DLQ

```js
// MongoDB shell
db.inbound_message_queue.find({ status: "dead-letter" }).sort({ updatedAt: -1 }).limit(20)
```

Campos clave:
- `_id`: jobId
- `envelope.workspaceId`: workspace afectado
- `envelope.externalMessageId`: correlationId Meta
- `failureReason`: motivo del fallo
- `attempts`: intentos realizados
- `deadLetteredAt`: cuándo pasó a DLQ

### 2. Buscar logs del error

```bash
# Buscar por correlationId en logs estructurados
cat /var/log/orqo-core.log | jq 'select(.correlationId == "wamid.XXX")'

# Buscar todos los errores de un workspace
cat /var/log/orqo-core.log | jq 'select(.level == "error" and .workspaceId == "ws-XXX")'
```

### 3. Causas comunes

| Causa | Indicador | Solución |
|---|---|---|
| Sin agente activo | `failureReason: "No hay agente activo"` | Crear/activar agente en MongoDB |
| Presupuesto excedido | `failureReason: "Presupuesto diario excedido"` | Aumentar límite o esperar reset UTC |
| Sin API key LLM | `failureReason: "No hay API keys configuradas"` | Setear `ANTHROPIC_API_KEY` o `OPENAI_API_KEY` |
| Error de red Meta | `failureReason: "WhatsApp API error"` | Verificar token en Meta Developer Console |
| Lock de conversación | `failureReason: "Lock ocupado"` | Esperar — el lock expira en 30s |

## Resolución

### Reintentar mensajes en DLQ

```js
// Mover de dead-letter a pending (permite hasta 4 reintentos más)
db.inbound_message_queue.updateMany(
  { status: "dead-letter", "envelope.workspaceId": "ws-XXX" },
  {
    $set: {
      status: "pending",
      availableAt: new Date(),
      attempts: 0,
      failureReason: null,
    }
  }
)
```

### Descartar mensajes irrelevantes

```js
// Eliminar del DLQ (no hay retransmisión al usuario)
db.inbound_message_queue.deleteMany({
  status: "dead-letter",
  deadLetteredAt: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) }
})
```

## Prevención

- Configurar alertas en Grafana para `orqo_queue_jobs_processed_total{status="error"} > 5` en 5 minutos
- Revisar `/healthz` periódicamente en oncall
- Asegurarse de que siempre haya al menos un agente activo por workspace
