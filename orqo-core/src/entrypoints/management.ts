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
import { ProvisionWorkspaceHandler } from '../application/commands/provision-workspace/ProvisionWorkspaceHandler.js';
import { createProvisionWorkspaceCommand } from '../application/commands/provision-workspace/ProvisionWorkspaceCommand.js';
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
  const provisionHandler = new ProvisionWorkspaceHandler(workspaceRepo, agentRepo, policyRepo);

  // Crear índices al arrancar
  await workspaceRepo.ensureIndexes();

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
          agentName: body['agentName'] ? String(body['agentName']) : undefined,
          plan: body['plan'] ? String(body['plan']) : undefined,
          timezone: body['timezone'] ? String(body['timezone']) : undefined,
          trialDays: body['trialDays'] ? Number(body['trialDays']) : undefined,
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

      // ── Rutas con /:id ─────────────────────────────────────────────────────
      const idMatch = pathname.match(/^\/workspaces\/([^/]+)(\/[\w-]+)?$/);
      if (!idMatch) {
        notFound(res);
        return;
      }

      const workspaceId = idMatch[1]!;
      const subpath = idMatch[2] ?? '';

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

function serializeWorkspace(w: { id: string; name: string; status: string; plan: string; timezone: string; branding: { agentName: string }; limits: object; createdAt: Date; updatedAt: Date; trialEndsAt?: Date; apiKey: { prefix: string } }) {
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
    trialEndsAt: w.trialEndsAt,
  };
}

async function start() {
  const mongoClient = await MongoClient.connect(
    process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017',
  );
  const db = mongoClient.db(process.env['MONGODB_DB'] ?? 'orqo');
  const handler = await buildRoutes(db);

  const server = createServer((req, res) => {
    void handler(req, res);
  });

  const port = Number(process.env['MANAGEMENT_PORT'] ?? 3002);
  server.listen(port, () => {
    log.info('Management API iniciada', {
      port,
      endpoints: [
        'POST /workspaces',
        'GET /workspaces',
        'GET /workspaces/:id',
        'POST /workspaces/:id/activate',
        'POST /workspaces/:id/suspend',
        'POST /workspaces/:id/cancel',
        'POST /workspaces/:id/rotate-key',
      ],
    });
  });
}

start().catch(error => {
  log.error('Error fatal en management API', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
