# Runbook: Alta Latencia de Respuesta

## Síntomas

- Usuarios reportan respuestas lentas (> 10s)
- Métrica `orqo_llm_latency_seconds{pass="first"}` P95 > 5s
- `/healthz` retorna `mongodb.status: "degraded"` con `latencyMs > 200`

## Diagnóstico

### 1. Identificar el cuello de botella

```bash
# Latencia por componente en métricas
curl http://localhost:3001/metrics | grep orqo_llm_latency

# Estado del health check
curl http://localhost:3001/healthz | jq .
```

### 2. Latencia alta en LLM

```bash
# Ver distribución de latencia por modelo
curl http://localhost:3001/metrics | grep orqo_llm_latency_seconds_bucket
```

**Causas:**
- Rate limiting del proveedor → ver `orqo_llm_calls_total` subiendo rápido
- Modelo saturado → revisar status page del proveedor
- Historial de conversación muy largo → la API tarda más con más tokens

**Acciones:**
1. Verificar que `FallbackLlmGateway` esté intentando el fallback:
   ```bash
   cat /var/log/orqo-core.log | jq 'select(.message | contains("falló, intentando fallback"))'
   ```
2. Reducir `maxInputTokens` en la política del workspace afectado
3. Agregar un modelo más rápido (e.g. `claude-haiku`) como fallback inmediato

### 3. Latencia alta en MongoDB

```bash
# Ver latencia de MongoDB en health check
curl http://localhost:3001/healthz | jq '.checks.mongodb'
```

**Causas:**
- Índices faltantes en colecciones de alta escritura
- Atlas cluster bajo en recursos (M0 free tier)
- Locks de conversación acumulados

**Acciones:**
1. Verificar índices:
   ```js
   db.inbound_message_queue.getIndexes()
   db.conversation_locks.getIndexes()
   ```
2. Ver locks activos:
   ```js
   db.conversation_locks.find().sort({ acquiredAt: -1 })
   ```
3. Si hay locks colgados (> 30s sin expirar), eliminarlos:
   ```js
   db.conversation_locks.deleteMany({ expiresAt: { $lt: new Date() } })
   ```

### 4. Tools lentas

```bash
# Ver tool calls con timeout
cat /var/log/orqo-core.log | jq 'select(.message | contains("Timeout en tool"))'

# Métricas de tool calls por status
curl http://localhost:3001/metrics | grep orqo_tool_calls_total
```

**Acciones:**
1. Aumentar `toolTimeoutMs` en la política del workspace si la herramienta es lenta por diseño
2. Si el servidor MCP está caído, la skill MCP fallará automáticamente

## Configuración recomendada

```js
// Política conservadora para baja latencia
db.model_policies.updateOne(
  { _id: "ws-XXX" },
  {
    $set: {
      primary: { provider: "anthropic", model: "claude-haiku-4-5-20251001", maxTokens: 512 },
      fallbacks: [],
      guardrails: {
        maxToolCallsPerTurn: 1,
        toolTimeoutMs: 5000,
        maxInputTokens: 4096,
      }
    }
  },
  { upsert: true }
)
```

## Alertas recomendadas

| Métrica | Umbral | Acción |
|---|---|---|
| `orqo_llm_latency_seconds` P95 | > 10s | PagerDuty oncall |
| `orqo_budget_exceeded_total` | > 0/min | Slack warning |
| `mongodb.latencyMs` | > 500ms | Slack warning |
