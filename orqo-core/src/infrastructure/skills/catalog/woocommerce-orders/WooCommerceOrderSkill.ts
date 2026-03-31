import { Ok, type Result } from '../../../../shared/Result.js';
import type { ISkill, SkillContext, SkillResult } from '../../../../domain/skill/ISkill.js';
import type { SkillManifest } from '../../../../domain/skill/SkillManifest.js';

/**
 * Skill: WooCommerce Orders
 *
 * Skill respaldada por MCP — la ejecución real ocurre en el servidor MCP
 * de WooCommerce (proceso separado). Este archivo solo define:
 *   - El manifest (descripción para el LLM + config del servidor MCP)
 *   - El pre-filtro canHandle()
 *   - Un fallback en execute() para cuando no hay MCP disponible
 *
 * Para agregar soporte a una nueva tienda: configurar WC_URL/WC_KEY/WC_SECRET
 * en las variables de entorno — sin tocar este archivo.
 */
export class WooCommerceOrderSkill implements ISkill {
  readonly manifest: SkillManifest = {
    id: 'woocommerce-orders',
    name: 'WooCommerce — Gestión de Pedidos',
    description:
      'Consulta el estado de pedidos WooCommerce, rastrea envíos, ' +
      'obtiene detalles de compra por número de orden o teléfono del cliente. ' +
      'Usa esta herramienta cuando el usuario pregunte por su pedido, ' +
      'compra, envío, entrega o tracking.',
    version: '1.0.0',
    author: 'Bacata Digital Media',
    tags: ['ecommerce', 'woocommerce', 'orders', 'shipping'],
    triggers: [
      { type: 'keyword', value: 'pedido' },
      { type: 'keyword', value: 'orden' },
      { type: 'keyword', value: 'envío' },
      { type: 'keyword', value: 'entrega' },
      { type: 'keyword', value: 'compra' },
      { type: 'keyword', value: 'tracking' },
      { type: 'intent', value: 'order_status' },
      { type: 'intent', value: 'track_shipment' },
    ],
    mcpServer: {
      transport: 'stdio',
      command: 'node',
      args: ['./mcp-servers/woocommerce/dist/index.js'],
      env: {
        WC_URL: process.env['WC_URL'] ?? '',
        WC_CONSUMER_KEY: process.env['WC_CONSUMER_KEY'] ?? '',
        WC_CONSUMER_SECRET: process.env['WC_CONSUMER_SECRET'] ?? '',
      },
    },
    inputSchema: {
      type: 'object',
      properties: {
        orderId: {
          type: 'string',
          description: 'Número de pedido (ej: 1042)',
        },
        customerPhone: {
          type: 'string',
          description: 'Teléfono del cliente para buscar sus pedidos',
        },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        orderId: { type: 'string' },
        status: { type: 'string' },
        total: { type: 'string' },
        trackingNumber: { type: 'string' },
      },
    },
  };

  canHandle(context: SkillContext): boolean {
    const lower = context.message.toLowerCase();
    return this.manifest.triggers.some(
      t => t.type === 'keyword' && t.value && lower.includes(t.value),
    );
  }

  /**
   * Fallback cuando no hay servidor MCP disponible.
   * La AgentOrchestrationService invoca mcpServer cuando está configurado;
   * este execute() solo se llama en pruebas o cuando mcpServer no responde.
   */
  async execute(_context: SkillContext): Promise<Result<SkillResult>> {
    return Ok({
      content: 'Por favor proporciona tu número de pedido para consultarlo.',
      metadata: { fallback: true },
    });
  }
}
