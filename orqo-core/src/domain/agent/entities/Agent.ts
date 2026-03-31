export class Agent {
  constructor(
    public readonly id: string,
    public readonly workspaceId: string,
    public readonly name: string,
    /**
     * System prompt que se inyecta en cada llamada al LLM.
     * Define la personalidad y restricciones del agente.
     */
    public readonly systemPrompt: string,
    /**
     * IDs de Skills habilitadas para este agente.
     * El registry filtra el catálogo global a solo estas.
     */
    public readonly enabledSkillIds: string[],
    public readonly interactionLimit: number = 20,
    public readonly active: boolean = true,
  ) {}

  canUseSkill(skillId: string): boolean {
    return this.enabledSkillIds.includes(skillId);
  }

  get isActive(): boolean {
    return this.active;
  }
}
