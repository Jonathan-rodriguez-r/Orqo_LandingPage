import type { McpTemplateType, McpToolSchema, McpTrigger } from '../../domain/workspace/entities/WorkspaceMcpServer.js';
import type { McpServerConfig } from '../../domain/skill/SkillManifest.js';

export interface McpTemplate {
  type: McpTemplateType;
  name: string;
  description: string;
  tools: McpToolSchema[];
  triggers: McpTrigger[];
  /** Llaves de env requeridas para que funcione */
  requiredEnv: string[];
  /** Construye la McpServerConfig con las credenciales proporcionadas */
  buildConfig(credentials: Record<string, string>): McpServerConfig;
}

export const MCP_CATALOG: Record<McpTemplateType, McpTemplate> = {
  woocommerce: {
    type: 'woocommerce',
    name: 'WooCommerce',
    description: 'Integración con tiendas WooCommerce',
    tools: [
      {
        name: 'woocommerce_get_order',
        description:
          'Consulta el estado, detalles y tracking de un pedido WooCommerce por número de orden o teléfono del cliente. Úsala cuando el usuario pregunte por su pedido, compra, envío, entrega o tracking.',
        inputSchema: {
          type: 'object',
          properties: {
            orderId: { type: 'string', description: 'Número de pedido (ej: 1042)' },
            customerPhone: { type: 'string', description: 'Teléfono del cliente para buscar sus pedidos' },
          },
        },
      },
      {
        name: 'woocommerce_list_products',
        description:
          'Lista productos disponibles en la tienda con precio y stock. Úsala cuando el usuario pregunte por productos, precios, disponibilidad o catálogo.',
        inputSchema: {
          type: 'object',
          properties: {
            search: { type: 'string', description: 'Término de búsqueda' },
            category: { type: 'string', description: 'Categoría de producto' },
          },
        },
      },
    ],
    triggers: [
      { type: 'keyword', value: 'pedido' },
      { type: 'keyword', value: 'orden' },
      { type: 'keyword', value: 'envío' },
      { type: 'keyword', value: 'entrega' },
      { type: 'keyword', value: 'compra' },
      { type: 'keyword', value: 'tracking' },
      { type: 'keyword', value: 'producto' },
      { type: 'keyword', value: 'precio' },
      { type: 'keyword', value: 'stock' },
    ],
    requiredEnv: ['WC_URL', 'WC_CONSUMER_KEY', 'WC_CONSUMER_SECRET'],
    buildConfig(creds) {
      return {
        transport: 'stdio',
        command: 'node',
        args: ['./mcp-servers/woocommerce/dist/index.js'],
        env: {
          WC_URL: creds['WC_URL'] ?? '',
          WC_CONSUMER_KEY: creds['WC_CONSUMER_KEY'] ?? '',
          WC_CONSUMER_SECRET: creds['WC_CONSUMER_SECRET'] ?? '',
        },
      };
    },
  },

  shopify: {
    type: 'shopify',
    name: 'Shopify',
    description: 'Integración con tiendas Shopify',
    tools: [
      {
        name: 'shopify_get_order',
        description:
          'Consulta el estado y detalles de un pedido Shopify. Úsala cuando el usuario pregunte por su pedido, compra o envío.',
        inputSchema: {
          type: 'object',
          properties: {
            orderId: { type: 'string', description: 'Número de pedido o nombre (ej: #1001)' },
            customerEmail: { type: 'string', description: 'Email del cliente' },
          },
        },
      },
      {
        name: 'shopify_list_products',
        description:
          'Lista productos de la tienda Shopify con precios y disponibilidad.',
        inputSchema: {
          type: 'object',
          properties: {
            search: { type: 'string', description: 'Término de búsqueda' },
          },
        },
      },
    ],
    triggers: [
      { type: 'keyword', value: 'pedido' },
      { type: 'keyword', value: 'orden' },
      { type: 'keyword', value: 'envío' },
      { type: 'keyword', value: 'producto' },
      { type: 'keyword', value: 'precio' },
    ],
    requiredEnv: ['SHOPIFY_STORE_URL', 'SHOPIFY_ACCESS_TOKEN'],
    buildConfig(creds) {
      return {
        transport: 'stdio',
        command: 'node',
        args: ['./mcp-servers/shopify/dist/index.js'],
        env: {
          SHOPIFY_STORE_URL: creds['SHOPIFY_STORE_URL'] ?? '',
          SHOPIFY_ACCESS_TOKEN: creds['SHOPIFY_ACCESS_TOKEN'] ?? '',
        },
      };
    },
  },

  odoo: {
    type: 'odoo',
    name: 'Odoo ERP',
    description: 'Integración con Odoo ERP',
    tools: [
      {
        name: 'odoo_get_sale_order',
        description:
          'Consulta órdenes de venta en Odoo. Úsala cuando el usuario pregunte por su pedido, cotización o factura.',
        inputSchema: {
          type: 'object',
          properties: {
            orderId: { type: 'string', description: 'Número de orden de venta (ej: S00042)' },
            customerName: { type: 'string', description: 'Nombre del cliente' },
          },
        },
      },
      {
        name: 'odoo_check_inventory',
        description:
          'Consulta stock e inventario de productos en Odoo.',
        inputSchema: {
          type: 'object',
          properties: {
            productName: { type: 'string', description: 'Nombre del producto' },
          },
        },
      },
    ],
    triggers: [
      { type: 'keyword', value: 'pedido' },
      { type: 'keyword', value: 'cotización' },
      { type: 'keyword', value: 'factura' },
      { type: 'keyword', value: 'inventario' },
      { type: 'keyword', value: 'stock' },
    ],
    requiredEnv: ['ODOO_URL', 'ODOO_DB', 'ODOO_USERNAME', 'ODOO_API_KEY'],
    buildConfig(creds) {
      return {
        transport: 'stdio',
        command: 'node',
        args: ['./mcp-servers/odoo/dist/index.js'],
        env: {
          ODOO_URL: creds['ODOO_URL'] ?? '',
          ODOO_DB: creds['ODOO_DB'] ?? '',
          ODOO_USERNAME: creds['ODOO_USERNAME'] ?? '',
          ODOO_API_KEY: creds['ODOO_API_KEY'] ?? '',
        },
      };
    },
  },

  'rest-generic': {
    type: 'rest-generic',
    name: 'REST API Genérica',
    description: 'Integración con cualquier API REST via HTTP MCP',
    tools: [
      {
        name: 'rest_call',
        description:
          'Llama a un endpoint REST configurado. Úsala para consultas a sistemas externos.',
        inputSchema: {
          type: 'object',
          properties: {
            endpoint: { type: 'string', description: 'Ruta del endpoint (ej: /orders/123)' },
            params: { type: 'object', description: 'Parámetros de query o body' },
          },
        },
      },
    ],
    triggers: [{ type: 'always' }],
    requiredEnv: ['REST_BASE_URL', 'REST_API_KEY'],
    buildConfig(creds) {
      return {
        transport: 'http',
        url: creds['REST_MCP_SERVER_URL'] ?? 'http://localhost:8080',
        env: {
          REST_BASE_URL: creds['REST_BASE_URL'] ?? '',
          REST_API_KEY: creds['REST_API_KEY'] ?? '',
        },
      };
    },
  },

  custom: {
    type: 'custom',
    name: 'Servidor MCP Personalizado',
    description: 'Servidor MCP con configuración manual',
    tools: [],
    triggers: [{ type: 'always' }],
    requiredEnv: [],
    buildConfig(creds) {
      return {
        transport: (creds['transport'] as 'stdio' | 'sse' | 'http') ?? 'stdio',
        ...(creds['command'] ? { command: creds['command'], args: creds['args'] ? JSON.parse(creds['args']) as string[] : [] } : {}),
        ...(creds['url'] ? { url: creds['url'] } : {}),
      };
    },
  },
};

export function getTemplate(type: McpTemplateType): McpTemplate {
  return MCP_CATALOG[type];
}
