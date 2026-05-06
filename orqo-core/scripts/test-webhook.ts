/**
 * Script de diagnóstico: simula un webhook de WhatsApp y verifica que el agente responde.
 *
 * Uso:
 *   npx tsx scripts/test-webhook.ts --phone <phoneNumberId> [opciones]
 *
 * Opciones:
 *   --phone    phoneNumberId configurado en el workspace (requerido)
 *   --from     número del remitente simulado (default: 573001234567)
 *   --message  texto del mensaje de prueba (default: "Hola, esto es una prueba de diagnóstico")
 *   --core     URL base del core (default: https://core.orqo.io)
 *   --wait     segundos a esperar para que el worker procese (default: 12)
 *
 * Ejemplo:
 *   npx tsx scripts/test-webhook.ts --phone 573151234567 --core https://core.orqo.io
 */

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg && arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = 'true';
      }
    }
  }
  return args;
}

function parseMetrics(text: string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const line of text.split('\n')) {
    if (line.startsWith('#') || !line.trim()) continue;
    const lastSpace = line.lastIndexOf(' ');
    if (lastSpace === -1) continue;
    const key = line.slice(0, lastSpace).trim();
    const val = parseFloat(line.slice(lastSpace + 1));
    if (!isNaN(val)) result[key] = val;
  }
  return result;
}

function diffMetrics(before: Record<string, number>, after: Record<string, number>): Array<{ key: string; before: number; after: number; delta: number }> {
  const diffs: Array<{ key: string; before: number; after: number; delta: number }> = [];
  const RELEVANT = [
    'orqo_webhook_requests_total',
    'orqo_queue_jobs_processed_total',
    'orqo_queue_drain_errors_total',
    'orqo_llm_calls_total',
    'orqo_rate_limited_total',
  ];

  for (const [key, afterVal] of Object.entries(after)) {
    const isRelevant = RELEVANT.some(r => key.startsWith(r));
    if (!isRelevant) continue;
    const beforeVal = before[key] ?? 0;
    const delta = afterVal - beforeVal;
    if (delta !== 0) {
      diffs.push({ key, before: beforeVal, after: afterVal, delta });
    }
  }
  return diffs.sort((a, b) => a.key.localeCompare(b.key));
}

function buildWebhookPayload(phoneNumberId: string, from: string, message: string, wamid: string) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'test-entry-id',
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: 'TEST',
                phone_number_id: phoneNumberId,
              },
              contacts: [{ profile: { name: 'Test User' }, wa_id: from }],
              messages: [
                {
                  id: wamid,
                  from,
                  timestamp: Math.floor(Date.now() / 1000).toString(),
                  type: 'text',
                  text: { body: message },
                },
              ],
            },
            field: 'messages',
          },
        ],
      },
    ],
  };
}

async function fetchMetrics(coreUrl: string): Promise<Record<string, number>> {
  const res = await fetch(`${coreUrl}/metrics`);
  if (!res.ok) return {};
  return parseMetrics(await res.text());
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function label(key: string): string {
  if (key.includes('orqo_webhook_requests_total')) return 'Webhook recibido';
  if (key.includes('orqo_queue_jobs_processed_total')) return 'Jobs procesados por worker';
  if (key.includes('orqo_queue_drain_errors_total')) return 'Errores en worker';
  if (key.includes('orqo_llm_calls_total')) return 'Llamadas al LLM';
  if (key.includes('orqo_rate_limited_total')) return 'Rate limited';
  return key;
}

async function main() {
  const args = parseArgs(process.argv);
  const phoneNumberId = args['phone'] ?? '';
  const from = args['from'] ?? '573001234567';
  const message = args['message'] ?? 'Hola, esto es una prueba de diagnóstico ORQO';
  const coreUrl = (args['core'] ?? 'https://core.orqo.io').replace(/\/$/, '');
  const waitSecs = Number(args['wait'] ?? 12);

  if (!phoneNumberId) {
    console.error('\n❌ Falta --phone <phoneNumberId>\n');
    console.error('   Ejemplo: npx tsx scripts/test-webhook.ts --phone 573151234567\n');
    process.exit(1);
  }

  const wamid = `wamid.test.${Date.now()}`;

  console.log('\n┌─────────────────────────────────────────────────────────────────┐');
  console.log('│  ORQO — Diagnóstico de webhook WhatsApp                         │');
  console.log('└─────────────────────────────────────────────────────────────────┘');
  console.log(`   Core URL     : ${coreUrl}`);
  console.log(`   phoneNumberId: ${phoneNumberId}`);
  console.log(`   Remitente    : ${from}`);
  console.log(`   Mensaje      : "${message}"`);
  console.log(`   wamid        : ${wamid}\n`);

  // 1. Healthcheck
  process.stdout.write('1/4  Verificando healthz... ');
  try {
    const hRes = await fetch(`${coreUrl}/healthz`);
    const hData = await hRes.json() as any;
    if (hData.status === 'healthy' || hRes.ok) {
      console.log(`✅  ${hData.status ?? 'ok'}`);
    } else {
      console.log(`⚠️  status: ${hData.status} — el core puede no estar listo`);
      if (hData.error) console.log(`     error: ${hData.error}`);
    }
  } catch (e: any) {
    console.log(`❌  No se pudo conectar: ${e.message}`);
    process.exit(1);
  }

  // 2. Métricas base
  process.stdout.write('2/4  Leyendo métricas base... ');
  const metricsBefore = await fetchMetrics(coreUrl);
  const baselineKeys = Object.keys(metricsBefore).filter(k =>
    k.startsWith('orqo_webhook') || k.startsWith('orqo_queue') || k.startsWith('orqo_llm')
  );
  console.log(`✅  ${baselineKeys.length} contadores ORQO encontrados`);

  // 3. Enviar webhook
  process.stdout.write('3/4  Enviando webhook de prueba... ');
  const payload = buildWebhookPayload(phoneNumberId, from, message, wamid);
  let sendOk = false;
  try {
    const wRes = await fetch(`${coreUrl}/webhook/meta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (wRes.ok) {
      console.log('✅  El core respondió 200 OK (aceptó el webhook)');
      sendOk = true;
    } else {
      console.log(`❌  HTTP ${wRes.status} — el core rechazó el payload`);
    }
  } catch (e: any) {
    console.log(`❌  Error de red: ${e.message}`);
    process.exit(1);
  }

  if (!sendOk) {
    console.log('\n   El webhook fue rechazado antes de encolar. Revisar logs del core.\n');
    process.exit(1);
  }

  // 4. Polling de métricas
  console.log(`4/4  Esperando que el worker procese (max ${waitSecs}s)...`);
  let metricsAfter: Record<string, number> = {};
  let llmCalled = false;
  const start = Date.now();

  while (Date.now() - start < waitSecs * 1000) {
    await sleep(2000);
    metricsAfter = await fetchMetrics(coreUrl);
    const diffs = diffMetrics(metricsBefore, metricsAfter);
    llmCalled = diffs.some(d => d.key.includes('orqo_llm_calls_total') && d.delta > 0);
    const jobsProcessed = diffs.some(d => d.key.includes('orqo_queue_jobs_processed_total') && d.delta > 0);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    process.stdout.write(`\r   [${elapsed}s] jobs procesados: ${jobsProcessed ? '✅' : '⏳'}  LLM llamado: ${llmCalled ? '✅' : '⏳'}   `);
    if (llmCalled) break;
  }

  console.log('\n');

  // Resultado final
  const diffs = diffMetrics(metricsBefore, metricsAfter);
  console.log('┌─────────────────────────────────────────────────────────────────┐');
  console.log('│  Resultado                                                      │');
  console.log('└─────────────────────────────────────────────────────────────────┘');

  if (diffs.length === 0) {
    console.log('   ⚠️  No hubo cambios en métricas ORQO.');
    console.log('');
    console.log('   Posibles causas:');
    console.log(`   • phoneNumberId "${phoneNumberId}" no está registrado en ningún workspace`);
    console.log('   • El channelRouter no encontró workspace → mensaje descartado silenciosamente');
    console.log('   • El worker no está corriendo (container no inicializó)');
    console.log('');
    console.log(`   Verifica en: GET ${coreUrl}/healthz`);
  } else {
    for (const d of diffs) {
      const icon = d.key.includes('error') || d.key.includes('drain') ? '⚠️ ' : '✅ ';
      console.log(`   ${icon} ${label(d.key)}`);
      console.log(`      ${d.before} → ${d.after}  (Δ +${d.delta})`);
    }
    console.log('');
    if (llmCalled) {
      console.log('   ✅  El agente recibió el mensaje y llamó al LLM.');
      console.log('   📤  La respuesta fue enviada a través de MetaWhatsAppGateway.');
      console.log('       Si no llegó a WhatsApp, el problema está en el token/phoneNumberId del workspace.');
    } else {
      const jobsProcessed = diffs.some(d => d.key.includes('orqo_queue_jobs_processed_total') && d.delta > 0);
      const errors = diffs.some(d => d.key.includes('error') && d.delta > 0);
      if (jobsProcessed && errors) {
        console.log('   ⚠️  El job fue procesado pero terminó en error.');
        console.log('       Revisa los logs del core para ver el detalle del fallo.');
      } else if (jobsProcessed) {
        console.log('   ⚠️  Job procesado pero LLM no fue llamado.');
        console.log('       Puede que no haya agente activo en el workspace o que el mensaje fue filtrado.');
      } else {
        console.log('   ⚠️  El webhook llegó pero el worker aún no procesó el job.');
        console.log(`       Prueba aumentar el tiempo de espera: --wait 20`);
      }
    }
  }

  console.log('');
}

main().catch(error => {
  console.error('\n❌ Error fatal:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
