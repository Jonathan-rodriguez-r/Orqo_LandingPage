/**
 * Script de seed para crear un workspace inicial en desarrollo.
 * Uso:
 *   npx tsx scripts/seed-workspace.ts --name "Mi Tienda" --agentName "Sofía"
 *   npx tsx scripts/seed-workspace.ts --name "Tienda" --mcp woocommerce \
 *     --WC_URL https://tienda.com --WC_CONSUMER_KEY ck_xxx --WC_CONSUMER_SECRET cs_xxx
 *
 * Variables de entorno:
 *   MONGODB_URI  — Default: mongodb://localhost:27017
 *   MONGODB_DB   — Default: orqo
 */

import { MongoClient } from 'mongodb';
import { MongoWorkspaceRepository } from '../src/infrastructure/persistence/MongoWorkspaceRepository.js';
import { MongoAgentRepository } from '../src/infrastructure/persistence/MongoAgentRepository.js';
import { MongoTenantPolicyRepository } from '../src/infrastructure/persistence/MongoTenantPolicyRepository.js';
import { MongoWorkspaceMcpRepository } from '../src/infrastructure/persistence/MongoWorkspaceMcpRepository.js';
import { ProvisionWorkspaceHandler } from '../src/application/commands/provision-workspace/ProvisionWorkspaceHandler.js';
import { createProvisionWorkspaceCommand } from '../src/application/commands/provision-workspace/ProvisionWorkspaceCommand.js';
import { WorkspaceMcpServer, type McpTemplateType } from '../src/domain/workspace/entities/WorkspaceMcpServer.js';
import { MCP_CATALOG } from '../src/infrastructure/mcp/McpCatalog.js';

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

async function main() {
  const args = parseArgs(process.argv);
  const name = args['name'] ?? 'Mi Workspace';
  const agentName = args['agentName'] ?? args['agent-name'];
  const plan = args['plan'] ?? 'starter';
  const timezone = args['timezone'] ?? 'America/Bogota';
  const trialDays = args['trialDays'] ? Number(args['trialDays']) : 14;
  const mcpType = args['mcp'] as McpTemplateType | undefined;

  const mongoUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
  const mongoDb = process.env['MONGODB_DB'] ?? 'orqo';

  console.log(`\n🌱 Seeding workspace: "${name}"`);
  console.log(`   MongoDB: ${mongoUri}/${mongoDb}`);

  const client = await MongoClient.connect(mongoUri);
  const db = client.db(mongoDb);

  try {
    const workspaceRepo = new MongoWorkspaceRepository(db);
    const agentRepo = new MongoAgentRepository(db);
    const policyRepo = new MongoTenantPolicyRepository(db);
    const mcpRepo = new MongoWorkspaceMcpRepository(db);

    await workspaceRepo.ensureIndexes();
    await mcpRepo.ensureIndexes();

    const handler = new ProvisionWorkspaceHandler(workspaceRepo, agentRepo, policyRepo);
    const command = createProvisionWorkspaceCommand({
      name,
      agentName,
      plan,
      timezone,
      trialDays,
    });

    const result = await handler.handle(command);
    if (!result.ok) {
      console.error('❌ Error provisionando workspace:', result.error.message);
      process.exit(1);
    }

    const { workspaceId, apiKeyPlaintext, agentId } = result.value;

    console.log('\n✅ Workspace creado exitosamente\n');
    console.log('┌─────────────────────────────────────────────────────────────────┐');
    console.log(`│  Workspace ID  : ${workspaceId}`);
    console.log(`│  Agent ID      : ${agentId}`);
    console.log(`│  Plan          : ${plan}`);
    console.log(`│  Trial días    : ${trialDays}`);
    console.log('│');
    console.log(`│  API Key       : ${apiKeyPlaintext}`);
    console.log('│');
    console.log('│  ⚠️  Guarda la API Key — no se puede recuperar después');
    console.log('└─────────────────────────────────────────────────────────────────┘\n');
    console.log('Configura en tu .env:');
    console.log(`  WORKSPACE_ID=${workspaceId}`);
    console.log(`  ORQO_API_KEY=${apiKeyPlaintext}\n`);

    // ── Hito 6: seed MCP server si se especificó --mcp ────────────────────
    if (mcpType) {
      const template = MCP_CATALOG[mcpType];
      if (!template) {
        console.error(`❌ Tipo de MCP desconocido: ${mcpType}`);
        console.error(`   Tipos disponibles: ${Object.keys(MCP_CATALOG).join(', ')}`);
        process.exit(1);
      }

      // Construir credenciales desde los args
      const credentials: Record<string, string> = {};
      for (const envKey of template.requiredEnv) {
        const val = args[envKey];
        if (val) {
          credentials[envKey] = val;
        } else {
          console.warn(`⚠️  Credencial requerida no proporcionada: --${envKey}`);
        }
      }

      const serverConfig = template.buildConfig(credentials);
      const mcpServer = WorkspaceMcpServer.create({
        workspaceId,
        name: template.name,
        type: template.type,
        serverConfig,
        tools: template.tools,
        triggers: template.triggers,
        active: true,
      });

      const mcpSaveResult = await mcpRepo.save(mcpServer);
      if (!mcpSaveResult.ok) {
        console.error('❌ Error guardando MCP server:', mcpSaveResult.error.message);
        process.exit(1);
      }

      console.log(`✅ MCP server "${template.name}" configurado`);
      console.log(`   ID: ${mcpServer.id}`);
      console.log(`   Tools: ${template.tools.map(t => t.name).join(', ')}\n`);
    }
  } finally {
    await client.close();
  }
}

main().catch(error => {
  console.error('❌ Error fatal:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
