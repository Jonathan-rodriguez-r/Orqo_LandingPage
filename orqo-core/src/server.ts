/**
 * Entrypoint unificado para Railway.
 * Usa la variable ORQO_SERVICE para seleccionar el servidor:
 *   ORQO_SERVICE=webhook     → webhook + worker (default)
 *   ORQO_SERVICE=management  → Management API
 */
const service = process.env['ORQO_SERVICE'] ?? 'webhook';

if (service === 'management') {
  await import('./entrypoints/management.js');
} else {
  await import('./entrypoints/webhook.js');
}
