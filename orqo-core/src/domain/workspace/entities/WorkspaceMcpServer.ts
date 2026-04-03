import { randomUUID } from 'node:crypto';
import type { McpServerConfig } from '../../../domain/skill/SkillManifest.js';

export type McpTemplateType = 'woocommerce' | 'shopify' | 'odoo' | 'rest-generic' | 'custom';

/** Schema de una tool expuesta por el servidor MCP al LLM */
export interface McpToolSchema {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** Trigger para pre-filtrado sin llamar al LLM */
export interface McpTrigger {
  type: 'keyword' | 'always';
  value?: string;
}

export interface WorkspaceMcpServerProps {
  id: string;
  workspaceId: string;
  /** Nombre visible en el dashboard */
  name: string;
  /** Tipo de template o 'custom' */
  type: McpTemplateType;
  /** Config de conexión al servidor MCP */
  serverConfig: McpServerConfig;
  /** Tools que este servidor expone al LLM — se descubren al agregar o se definen por template */
  tools: McpToolSchema[];
  /** Triggers para pre-filtrado de contexto */
  triggers: McpTrigger[];
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class WorkspaceMcpServer {
  readonly id: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly type: McpTemplateType;
  readonly serverConfig: McpServerConfig;
  readonly tools: McpToolSchema[];
  readonly triggers: McpTrigger[];
  readonly active: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: WorkspaceMcpServerProps) {
    this.id = props.id;
    this.workspaceId = props.workspaceId;
    this.name = props.name;
    this.type = props.type;
    this.serverConfig = props.serverConfig;
    this.tools = props.tools;
    this.triggers = props.triggers;
    this.active = props.active;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(params: Omit<WorkspaceMcpServerProps, 'id' | 'createdAt' | 'updatedAt'>): WorkspaceMcpServer {
    const now = new Date();
    return new WorkspaceMcpServer({ ...params, id: randomUUID(), createdAt: now, updatedAt: now });
  }

  static reconstitute(props: WorkspaceMcpServerProps): WorkspaceMcpServer {
    return new WorkspaceMcpServer(props);
  }

  /** Devuelve true si el mensaje tiene algún trigger que active este servidor */
  matchesTriggers(message: string): boolean {
    if (this.triggers.length === 0) return true;
    const lower = message.toLowerCase();
    return this.triggers.some(t => {
      if (t.type === 'always') return true;
      return t.value !== undefined && lower.includes(t.value);
    });
  }

  disable(): WorkspaceMcpServer {
    return new WorkspaceMcpServer({ ...this._props(), active: false, updatedAt: new Date() });
  }

  enable(): WorkspaceMcpServer {
    return new WorkspaceMcpServer({ ...this._props(), active: true, updatedAt: new Date() });
  }

  updateTools(tools: McpToolSchema[]): WorkspaceMcpServer {
    return new WorkspaceMcpServer({ ...this._props(), tools, updatedAt: new Date() });
  }

  private _props(): WorkspaceMcpServerProps {
    return {
      id: this.id,
      workspaceId: this.workspaceId,
      name: this.name,
      type: this.type,
      serverConfig: this.serverConfig,
      tools: this.tools,
      triggers: this.triggers,
      active: this.active,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
