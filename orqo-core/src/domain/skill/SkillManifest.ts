/**
 * SkillManifest — "contrato público" de una Skill.
 *
 * El LLM usa `description` como descripción de tool.
 * `triggers` permite pre-filtrado rápido sin llamar al LLM.
 * `mcpServer` convierte cualquier servidor MCP externo en una Skill automáticamente.
 *
 * Principio OCP: agregar una Skill = crear un archivo con este manifest.
 * El core NUNCA necesita saber qué Skills existen.
 */

export type McpTransport = 'stdio' | 'sse' | 'http';

export interface McpServerConfig {
  transport: McpTransport;
  /** stdio: path al ejecutable */
  command?: string;
  /** stdio: argumentos del proceso */
  args?: string[];
  /** sse / http: URL del servidor */
  url?: string;
  /** Variables de entorno para el proceso MCP */
  env?: Record<string, string>;
}

export type TriggerType = 'intent' | 'keyword' | 'regex' | 'always';

export interface SkillTrigger {
  type: TriggerType;
  /** Valor del trigger (intent name / keyword / regex pattern) */
  value?: string;
  /** Confianza mínima requerida (0–1), solo para type: 'intent' */
  minConfidence?: number;
}

export interface SkillManifest {
  /** Identificador único — también es el nombre del tool expuesto al LLM. */
  readonly id: string;
  readonly name: string;
  /**
   * Descripción que el LLM lee para decidir si invocar esta Skill.
   * Redactar en el idioma del agente (español para ORQO).
   */
  readonly description: string;
  readonly version: string;
  readonly author: string;
  readonly tags: string[];
  /**
   * Pre-filtros: si ningún trigger hace match la Skill no se ofrece al LLM.
   * Mejora latencia y reduce tokens gastados en herramientas irrelevantes.
   */
  readonly triggers: SkillTrigger[];
  /**
   * Si está presente, la Orchestration Service delega la ejecución al
   * servidor MCP en lugar de llamar a execute() directamente.
   */
  readonly mcpServer?: McpServerConfig;
  /** JSON Schema del input esperado por el LLM al invocar esta tool. */
  readonly inputSchema?: Record<string, unknown>;
  /** JSON Schema de la respuesta (documentación interna). */
  readonly outputSchema?: Record<string, unknown>;
}
