/**
 * Management API — CRUD de workspaces (uso interno / admin).
 * Puerto: $MANAGEMENT_PORT (default 3002).
 *
 * Endpoints:
 *   POST   /workspaces              — Provisiona un workspace nuevo
 *   GET    /workspaces              — Lista workspaces (con filtro ?status=)
 *   GET    /workspaces/:id          — Obtiene un workspace por ID
 *   POST   /workspaces/:id/activate — Activa un workspace (trial → active)
 *   POST   /workspaces/:id/suspend  — Suspende un workspace
 *   POST   /workspaces/:id/cancel   — Cancela un workspace
 *   POST   /workspaces/:id/rotate-key — Rota la API key
 *   GET    /healthz                 — Health check básico
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { MongoClient, type Db } from 'mongodb';
import { MongoWorkspaceRepository } from '../infrastructure/persistence/MongoWorkspaceRepository.js';
import { MongoAgentRepository } from '../infrastructure/persistence/MongoAgentRepository.js';
import { MongoTenantPolicyRepository } from '../infrastructure/persistence/MongoTenantPolicyRepository.js';
import { MongoWorkspaceMcpRepository } from '../infrastructure/persistence/MongoWorkspaceMcpRepository.js';
import { MongoWorkspaceProviderKeysRepository } from '../infrastructure/persistence/MongoWorkspaceProviderKeysRepository.js';
import { MongoWorkspaceChannelConfigRepository } from '../infrastructure/persistence/MongoWorkspaceChannelConfigRepository.js';
import { WorkspaceChannelConfig, type ChannelType } from '../domain/workspace/entities/WorkspaceChannelConfig.js';
import { ProviderKey, type SupportedProvider } from '../domain/workspace/value-objects/ProviderKey.js';
import { WorkspaceProviderKeys } from '../domain/workspace/entities/WorkspaceProviderKeys.js';
import { ProvisionWorkspaceHandler } from '../application/commands/provision-workspace/ProvisionWorkspaceHandler.js';
import { createProvisionWorkspaceCommand } from '../application/commands/provision-workspace/ProvisionWorkspaceCommand.js';
import { WorkspaceMcpServer } from '../domain/workspace/entities/WorkspaceMcpServer.js';
import { MCP_CATALOG, getTemplate } from '../infrastructure/mcp/McpCatalog.js';
import { encrypt, getEncryptionKey } from '../infrastructure/crypto/AesEncryption.js';
import { createLogger } from '../shared/Logger.js';

const log = createLogger('orqo-core:management');

/** Lee el body JSON de una request. Lanza si es inválido. */
async function readJson(req: IncomingMessage): Promise<unknown> {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
  }
  return body ? JSON.parse(body) : {};
}

function json(res: ServerResponse, status: number, data: unknown): void {
  const payload = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(payload);
}

function notFound(res: ServerResponse): void {
  json(res, 404, { error: 'Not found' });
}

async function buildRoutes(db: Db) {
  const workspaceRepo = new MongoWorkspaceRepository(db);
  const agentRepo = new MongoAgentRepository(db);
  const policyRepo = new MongoTenantPolicyRepository(db);
  const mcpRepo = new MongoWorkspaceMcpRepository(db);
  const providerKeysRepo = new MongoWorkspaceProviderKeysRepository(db);
  const channelConfigRepo = new MongoWorkspaceChannelConfigRepository(db);
  const provisionHandler = new ProvisionWorkspaceHandler(workspaceRepo, agentRepo, policyRepo);

  // Crear índices al arrancar
  await workspaceRepo.ensureIndexes();
  await mcpRepo.ensureIndexes();
  await channelConfigRepo.ensureIndexes();

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const pathname = url.pathname;
    const method = req.method ?? 'GET';

    try {
      // ── Health check ───────────────────────────────────────────────────────
      if (method === 'GET' && pathname === '/healthz') {
        json(res, 200, { status: 'ok' });
        return;
      }

      // ── POST /workspaces — provisionar ────────────────────────────────────
      if (method === 'POST' && pathname === '/workspaces') {
        const body = (await readJson(req)) as Record<string, unknown>;
        const command = createProvisionWorkspaceCommand({
          name: String(body['name'] ?? ''),
          ...(body['agentName'] ? { agentName: String(body['agentName']) } : {}),
          ...(body['plan'] ? { plan: String(body['plan']) } : {}),
          ...(body['timezone'] ? { timezone: String(body['timezone']) } : {}),
          ...(body['trialDays'] ? { trialDays: Number(body['trialDays']) } : {}),
        });
        const result = await provisionHandler.handle(command);
        if (!result.ok) {
          json(res, 400, { error: result.error.message });
          return;
        }
        log.info('Workspace provisionado', { workspaceId: result.value.workspaceId });
        json(res, 201, result.value);
        return;
      }

      // ── GET /workspaces — listar ───────────────────────────────────────────
      if (method === 'GET' && pathname === '/workspaces') {
        const status = url.searchParams.get('status') ?? undefined;
        const listResult = await workspaceRepo.list(status ? { status } : undefined);
        if (!listResult.ok) {
          json(res, 500, { error: listResult.error.message });
          return;
        }
        json(res, 200, listResult.value.map(w => serializeWorkspace(w)));
        return;
      }

      // ── GET /mcp-catalog — listar templates disponibles ───────────────────
      if (method === 'GET' && pathname === '/mcp-catalog') {
        const catalog = Object.values(MCP_CATALOG).map(t => ({
          type: t.type,
          name: t.name,
          description: t.description,
          requiredEnv: t.requiredEnv,
          toolCount: t.tools.length,
        }));
        json(res, 200, catalog);
        return;
      }

      // ── Rutas con /:id ─────────────────────────────────────────────────────
      const idMatch = pathname.match(/^\/workspaces\/([^/]+)(\/.*)?$/);
      if (!idMatch) {
        notFound(res);
        return;
      }

      const workspaceId = idMatch[1]!;
      const subpath = idMatch[2] ?? '';

      // ── MCP server routes (don't require workspace entity lookup for all) ──
      // POST /workspaces/:id/mcp-servers
      if (method === 'POST' && subpath === '/mcp-servers') {
        const body = (await readJson(req)) as Record<string, unknown>;
        const type = String(body['type'] ?? '');
        const credentials = (body['credentials'] ?? {}) as Record<string, string>;

        if (!Object.keys(MCP_CATALOG).includes(type)) {
          json(res, 400, { error: `Tipo de MCP desconocido: ${type}` });
          return;
        }

        const template = getTemplate(type as keyof typeof MCP_CATALOG);
        const serverConfig = template.buildConfig(credentials);
        const server = WorkspaceMcpServer.create({
          workspaceId,
          name: template.name,
          type: template.type,
          serverConfig,
          tools: template.tools,
          triggers: template.triggers,
          active: true,
        });

        const saveResult = await mcpRepo.save(server);
        if (!saveResult.ok) {
          json(res, 500, { error: saveResult.error.message });
          return;
        }

        log.info('MCP server añadido', { workspaceId, mcpId: server.id, type });
        json(res, 201, serializeMcpServer(server));
        return;
      }

      // GET /workspaces/:id/mcp-servers
      if (method === 'GET' && subpath === '/mcp-servers') {
        const listResult = await mcpRepo.findByWorkspace(workspaceId);
        if (!listResult.ok) {
          json(res, 500, { error: listResult.error.message });
          return;
        }
        json(res, 200, listResult.value.map(serializeMcpServer));
        return;
      }

      // Routes with /mcp-servers/:mcpId
      const mcpMatch = subpath.match(/^\/mcp-servers\/([^/]+)(\/[\w-]+)?$/);
      if (mcpMatch) {
        const mcpId = mcpMatch[1]!;
        const mcpSubpath = mcpMatch[2] ?? '';

        const mcpFindResult = await mcpRepo.findById(mcpId);
        if (!mcpFindResult.ok) {
          json(res, 500, { error: mcpFindResult.error.message });
          return;
        }
        if (!mcpFindResult.value) {
          json(res, 404, { error: 'MCP server no encontrado' });
          return;
        }

        let mcpServer = mcpFindResult.value;

        // DELETE /workspaces/:id/mcp-servers/:mcpId
        if (method === 'DELETE' && mcpSubpath === '') {
          const deleteResult = await mcpRepo.delete(mcpId);
          if (!deleteResult.ok) {
            json(res, 500, { error: deleteResult.error.message });
            return;
          }
          log.info('MCP server eliminado', { workspaceId, mcpId });
          json(res, 200, { deleted: true });
          return;
        }

        // POST /workspaces/:id/mcp-servers/:mcpId/enable
        if (method === 'POST' && mcpSubpath === '/enable') {
          mcpServer = mcpServer.enable();
          const saveResult = await mcpRepo.save(mcpServer);
          if (!saveResult.ok) {
            json(res, 500, { error: saveResult.error.message });
            return;
          }
          log.info('MCP server activado', { workspaceId, mcpId });
          json(res, 200, serializeMcpServer(mcpServer));
          return;
        }

        // POST /workspaces/:id/mcp-servers/:mcpId/disable
        if (method === 'POST' && mcpSubpath === '/disable') {
          mcpServer = mcpServer.disable();
          const saveResult = await mcpRepo.save(mcpServer);
          if (!saveResult.ok) {
            json(res, 500, { error: saveResult.error.message });
            return;
          }
          log.info('MCP server desactivado', { workspaceId, mcpId });
          json(res, 200, serializeMcpServer(mcpServer));
          return;
        }

        notFound(res);
        return;
      }

      // ── GET /workspaces/:id/provider-keys ─────────────────────────────────
      if (method === 'GET' && subpath === '/provider-keys') {
        const keysResult = await providerKeysRepo.findByWorkspaceId(workspaceId);
        if (!keysResult.ok) {
          json(res, 500, { error: keysResult.error.message });
          return;
        }
        const prefixes = keysResult.value ? keysResult.value.allPrefixes() : {};
        const response: Record<string, { prefix: string }> = {};
        for (const [provider, prefix] of Object.entries(prefixes)) {
          response[provider] = { prefix };
        }
        json(res, 200, response);
        return;
      }

      // ── PUT /workspaces/:id/provider-keys ─────────────────────────────────
      if (method === 'PUT' && subpath === '/provider-keys') {
        const body = (await readJson(req)) as Record<string, unknown>;
        const provider = String(body['provider'] ?? '') as SupportedProvider;
        const apiKey = String(body['apiKey'] ?? '');

        if (provider !== 'anthropic' && provider !== 'openai') {
          json(res, 400, { error: 'Proveedor inválido. Debe ser "anthropic" o "openai"' });
          return;
        }

        const encryptionKey = process.env['ORQO_ENCRYPTION_KEY'] ?? '';
        if (!encryptionKey) {
          json(res, 500, { error: 'ORQO_ENCRYPTION_KEY no está configurada' });
          return;
        }

        const providerKeyResult = ProviderKey.create(provider, apiKey, encryptionKey);
        if (!providerKeyResult.ok) {
          json(res, 400, { error: providerKeyResult.error.message });
          return;
        }

        const existingResult = await providerKeysRepo.findByWorkspaceId(workspaceId);
        if (!existingResult.ok) {
          json(res, 500, { error: existingResult.error.message });
          return;
        }

        const existing = existingResult.value ?? WorkspaceProviderKeys.create(workspaceId);
        const updated = existing.withKey(providerKeyResult.value);
        const saveResult = await providerKeysRepo.save(updated);
        if (!saveResult.ok) {
          json(res, 500, { error: saveResult.error.message });
          return;
        }

        log.info('Provider key actualizada', { workspaceId, provider });
        json(res, 200, { provider, prefix: providerKeyResult.value.prefix });
        return;
      }

      // ── DELETE /workspaces/:id/provider-keys/:provider ────────────────────
      const providerKeyMatch = subpath.match(/^\/provider-keys\/(anthropic|openai)$/);
      if (method === 'DELETE' && providerKeyMatch) {
        const provider = providerKeyMatch[1]! as SupportedProvider;

        const existingResult = await providerKeysRepo.findByWorkspaceId(workspaceId);
        if (!existingResult.ok) {
          json(res, 500, { error: existingResult.error.message });
          return;
        }

        if (!existingResult.value || !existingResult.value.hasKey(provider)) {
          json(res, 404, { error: `No hay key configurada para el proveedor: ${provider}` });
          return;
        }

        const updated = existingResult.value.withoutKey(provider);
        const saveResult = await providerKeysRepo.save(updated);
        if (!saveResult.ok) {
          json(res, 500, { error: saveResult.error.message });
          return;
        }

        log.info('Provider key eliminada', { workspaceId, provider });
        json(res, 200, { deleted: true, provider });
        return;
      }

      // ── GET /workspaces/:id/channels ──────────────────────────────────────
      if (method === 'GET' && subpath === '/channels') {
        const chanResult = await channelConfigRepo.findByWorkspaceId(workspaceId);
        if (!chanResult.ok) {
          json(res, 500, { error: chanResult.error.message });
          return;
        }
        const config = chanResult.value ?? WorkspaceChannelConfig.create(workspaceId);
        json(res, 200, config.toPublic());
        return;
      }

      // ── PUT /workspaces/:id/channels/whatsapp ─────────────────────────────
      if (method === 'PUT' && subpath === '/channels/whatsapp') {
        const body = (await readJson(req)) as Record<string, unknown>;
        const phoneNumberId = String(body['phoneNumberId'] ?? '').trim();
        const accessToken = String(body['accessToken'] ?? '').trim();

        if (!phoneNumberId || !accessToken) {
          json(res, 400, { error: 'phoneNumberId y accessToken son obligatorios' });
          return;
        }

        let encryptionKey: string;
        try {
          encryptionKey = getEncryptionKey();
        } catch (e) {
          json(res, 500, { error: e instanceof Error ? e.message : String(e) });
          return;
        }

        const encryptedToken = encrypt(accessToken, encryptionKey);
        const tokenPrefix = accessToken.slice(0, 12);

        const existingResult = await channelConfigRepo.findByWorkspaceId(workspaceId);
        if (!existingResult.ok) {
          json(res, 500, { error: existingResult.error.message });
          return;
        }

        const existing = existingResult.value ?? WorkspaceChannelConfig.create(workspaceId);
        const updated = existing.withWhatsApp({ phoneNumberId, encryptedToken, tokenPrefix });
        const saveResult = await channelConfigRepo.save(updated);
        if (!saveResult.ok) {
          json(res, 500, { error: saveResult.error.message });
          return;
        }

        log.info('Canal WhatsApp configurado', { workspaceId, phoneNumberId });
        json(res, 200, updated.toPublic());
        return;
      }

      // ── PUT /workspaces/:id/channels/instagram ────────────────────────────
      if (method === 'PUT' && subpath === '/channels/instagram') {
        const body = (await readJson(req)) as Record<string, unknown>;
        const igAccountId = String(body['igAccountId'] ?? '').trim();
        const accessToken = String(body['accessToken'] ?? '').trim();

        if (!igAccountId || !accessToken) {
          json(res, 400, { error: 'igAccountId y accessToken son obligatorios' });
          return;
        }

        let encryptionKey: string;
        try {
          encryptionKey = getEncryptionKey();
        } catch (e) {
          json(res, 500, { error: e instanceof Error ? e.message : String(e) });
          return;
        }

        const encryptedToken = encrypt(accessToken, encryptionKey);
        const tokenPrefix = accessToken.slice(0, 12);

        const existingResult = await channelConfigRepo.findByWorkspaceId(workspaceId);
        if (!existingResult.ok) {
          json(res, 500, { error: existingResult.error.message });
          return;
        }

        const existing = existingResult.value ?? WorkspaceChannelConfig.create(workspaceId);
        const updated = existing.withInstagram({ igAccountId, encryptedToken, tokenPrefix });
        const saveResult = await channelConfigRepo.save(updated);
        if (!saveResult.ok) {
          json(res, 500, { error: saveResult.error.message });
          return;
        }

        log.info('Canal Instagram configurado', { workspaceId, igAccountId });
        json(res, 200, updated.toPublic());
        return;
      }

      // ── PUT /workspaces/:id/channels/facebook ─────────────────────────────
      if (method === 'PUT' && subpath === '/channels/facebook') {
        const body = (await readJson(req)) as Record<string, unknown>;
        const pageId = String(body['pageId'] ?? '').trim();
        const accessToken = String(body['accessToken'] ?? '').trim();

        if (!pageId || !accessToken) {
          json(res, 400, { error: 'pageId y accessToken son obligatorios' });
          return;
        }

        let encryptionKey: string;
        try {
          encryptionKey = getEncryptionKey();
        } catch (e) {
          json(res, 500, { error: e instanceof Error ? e.message : String(e) });
          return;
        }

        const encryptedToken = encrypt(accessToken, encryptionKey);
        const tokenPrefix = accessToken.slice(0, 12);

        const existingResult = await channelConfigRepo.findByWorkspaceId(workspaceId);
        if (!existingResult.ok) {
          json(res, 500, { error: existingResult.error.message });
          return;
        }

        const existing = existingResult.value ?? WorkspaceChannelConfig.create(workspaceId);
        const updated = existing.withFacebook({ pageId, encryptedToken, tokenPrefix });
        const saveResult = await channelConfigRepo.save(updated);
        if (!saveResult.ok) {
          json(res, 500, { error: saveResult.error.message });
          return;
        }

        log.info('Canal Facebook Messenger configurado', { workspaceId, pageId });
        json(res, 200, updated.toPublic());
        return;
      }

      // ── DELETE /workspaces/:id/channels/:channelType ──────────────────────
      const channelDeleteMatch = subpath.match(/^\/channels\/(whatsapp|instagram|facebook)$/);
      if (method === 'DELETE' && channelDeleteMatch) {
        const channelType = channelDeleteMatch[1]! as ChannelType;

        const existingResult = await channelConfigRepo.findByWorkspaceId(workspaceId);
        if (!existingResult.ok) {
          json(res, 500, { error: existingResult.error.message });
          return;
        }

        if (!existingResult.value) {
          json(res, 404, { error: 'No hay configuración de canales para este workspace' });
          return;
        }

        const updated = existingResult.value.withoutChannel(channelType);
        const saveResult = await channelConfigRepo.save(updated);
        if (!saveResult.ok) {
          json(res, 500, { error: saveResult.error.message });
          return;
        }

        log.info('Canal eliminado', { workspaceId, channelType });
        json(res, 200, { deleted: true, channel: channelType });
        return;
      }

      const findResult = await workspaceRepo.findById(workspaceId);
      if (!findResult.ok) {
        json(res, 500, { error: findResult.error.message });
        return;
      }
      if (!findResult.value) {
        json(res, 404, { error: 'Workspace no encontrado' });
        return;
      }

      let workspace = findResult.value;

      // GET /workspaces/:id
      if (method === 'GET' && subpath === '') {
        json(res, 200, serializeWorkspace(workspace));
        return;
      }

      // POST /workspaces/:id/activate
      if (method === 'POST' && subpath === '/activate') {
        const activateResult = workspace.activate();
        if (!activateResult.ok) {
          json(res, 400, { error: activateResult.error.message });
          return;
        }
        workspace = activateResult.value;
        await workspaceRepo.save(workspace);
        log.info('Workspace activado', { workspaceId });
        json(res, 200, serializeWorkspace(workspace));
        return;
      }

      // POST /workspaces/:id/suspend
      if (method === 'POST' && subpath === '/suspend') {
        const suspendResult = workspace.suspend();
        if (!suspendResult.ok) {
          json(res, 400, { error: suspendResult.error.message });
          return;
        }
        workspace = suspendResult.value;
        await workspaceRepo.save(workspace);
        log.info('Workspace suspendido', { workspaceId });
        json(res, 200, serializeWorkspace(workspace));
        return;
      }

      // POST /workspaces/:id/cancel
      if (method === 'POST' && subpath === '/cancel') {
        const cancelResult = workspace.cancel();
        if (!cancelResult.ok) {
          json(res, 400, { error: cancelResult.error.message });
          return;
        }
        workspace = cancelResult.value;
        await workspaceRepo.save(workspace);
        log.info('Workspace cancelado', { workspaceId });
        json(res, 200, serializeWorkspace(workspace));
        return;
      }

      // POST /workspaces/:id/rotate-key
      if (method === 'POST' && subpath === '/rotate-key') {
        const { workspace: updated, apiKeyPlaintext } = workspace.rotateApiKey();
        await workspaceRepo.save(updated);
        log.info('API key rotada', { workspaceId });
        json(res, 200, { ...serializeWorkspace(updated), apiKeyPlaintext });
        return;
      }

      notFound(res);
    } catch (error) {
      log.error('Error en management API', {
        error: error instanceof Error ? error.message : String(error),
        path: pathname,
        method,
      });
      json(res, 500, { error: 'Internal server error' });
    }
  };
}

function serializeMcpServer(s: WorkspaceMcpServer) {
  return {
    id: s.id,
    workspaceId: s.workspaceId,
    name: s.name,
    type: s.type,
    active: s.active,
    toolCount: s.tools.length,
    tools: s.tools.map(t => ({ name: t.name, description: t.description })),
    triggers: s.triggers,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

function serializeWorkspace(w: { id: string; name: string; status: string; plan: string; timezone: string; branding: { agentName: string }; limits: object; createdAt: Date; updatedAt: Date; trialEndsAt: Date | undefined; apiKey: { prefix: string } }) {
  return {
    id: w.id,
    name: w.name,
    status: w.status,
    plan: w.plan,
    timezone: w.timezone,
    agentName: w.branding.agentName,
    limits: w.limits,
    apiKeyPrefix: w.apiKey.prefix,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
    ...(w.trialEndsAt !== undefined ? { trialEndsAt: w.trialEndsAt } : {}),
  };
}

const INTERNAL_SECRET = process.env['CORE_INTERNAL_SECRET'] ?? '';

async function start() {
  const port = Number(process.env['PORT'] ?? process.env['MANAGEMENT_PORT'] ?? 3002);

  let handler: ((req: IncomingMessage, res: ServerResponse) => Promise<void>) | null = null;
  let initError: Error | null = null;

  // 1. Levanta el servidor HTTP inmediatamente para que Railway haga el healthcheck
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const pathname = url.pathname;
    const method = req.method ?? 'GET';

    // /ping — responde sin DB ni auth
    if (method === 'GET' && pathname === '/ping') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    // /healthz — responde sin auth
    if (method === 'GET' && pathname === '/healthz') {
      if (initError) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'unhealthy', error: initError.message }));
        return;
      }
      res.writeHead(handler ? 200 : 503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: handler ? 'ok' : 'starting' }));
      return;
    }

    // Autenticación — todas las rutas reales requieren CORE_INTERNAL_SECRET
    if (INTERNAL_SECRET && req.headers['x-orqo-internal-secret'] !== INTERNAL_SECRET) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    if (!handler) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Service initializing, retry in a few seconds' }));
      return;
    }

    void handler(req, res);
  });

  server.listen(port, () => {
    log.info('Management API HTTP escuchando', { port });
  });

  // 2. Conecta MongoDB y registra rutas en segundo plano
  MongoClient.connect(process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017')
    .then(async mongoClient => {
      const db = mongoClient.db(process.env['MONGODB_DB'] ?? 'orqo');
      handler = await buildRoutes(db);
      log.info('Management API lista', {
        port,
      endpoints: [
        'POST /workspaces',
        'GET /workspaces',
        'GET /workspaces/:id',
        'POST /workspaces/:id/activate',
        'POST /workspaces/:id/suspend',
        'POST /workspaces/:id/cancel',
        'POST /workspaces/:id/rotate-key',
        'POST /workspaces/:id/mcp-servers',
        'GET /workspaces/:id/mcp-servers',
        'DELETE /workspaces/:id/mcp-servers/:mcpId',
        'POST /workspaces/:id/mcp-servers/:mcpId/enable',
        'POST /workspaces/:id/mcp-servers/:mcpId/disable',
        'GET /workspaces/:id/provider-keys',
        'PUT /workspaces/:id/provider-keys',
        'DELETE /workspaces/:id/provider-keys/:provider',
        'GET /workspaces/:id/channels',
        'PUT /workspaces/:id/channels/whatsapp',
        'PUT /workspaces/:id/channels/instagram',
        'PUT /workspaces/:id/channels/facebook',
        'DELETE /workspaces/:id/channels/:channelType',
        'GET /mcp-catalog',
      ],
      });
    })
    .catch((err: unknown) => {
      initError = err instanceof Error ? err : new Error(String(err));
      log.error('Error inicializando Management API', { error: initError.message });
    });
}

start().catch(error => {
  log.error('Error fatal en management API', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
