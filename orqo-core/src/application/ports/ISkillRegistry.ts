import type { ISkill, SkillContext } from '../../domain/skill/ISkill.js';

/**
 * El registry es el único punto de acoplamiento entre el core y las Skills.
 * Las Skills se registran en el Container — el core nunca las importa directamente.
 */
export interface ISkillRegistry {
  register(skill: ISkill): void;
  getAll(): ISkill[];
  findById(id: string): ISkill | undefined;
  /**
   * Devuelve Skills cuyo manifest.triggers hacen match con el contexto.
   * Pre-filtro antes de construir el toolset para el LLM.
   */
  findCapable(context: SkillContext): ISkill[];
}
