import type { ISkill, SkillContext } from '../../domain/skill/ISkill.js';
import type { ISkillRegistry } from '../../application/ports/ISkillRegistry.js';

/**
 * Implementación del SkillRegistry.
 *
 * Principio OCP en acción:
 *   - Para agregar una nueva Skill: crear la clase e invocar registry.register(new MiSkill())
 *   - Este archivo NUNCA cambia al agregar Skills
 *   - El Container es el único punto que lista qué Skills están activas
 */
export class SkillRegistry implements ISkillRegistry {
  private readonly skills = new Map<string, ISkill>();

  register(skill: ISkill): void {
    if (this.skills.has(skill.manifest.id)) {
      throw new Error(
        `[SkillRegistry] Skill ya registrada: "${skill.manifest.id}". ` +
        `Verifica que no haya duplicados en el Container.`,
      );
    }
    this.skills.set(skill.manifest.id, skill);
    console.info(
      `[SkillRegistry] ✓ ${skill.manifest.id} v${skill.manifest.version} — ${skill.manifest.name}`,
    );
  }

  getAll(): ISkill[] {
    return Array.from(this.skills.values());
  }

  findById(id: string): ISkill | undefined {
    return this.skills.get(id);
  }

  findCapable(context: SkillContext): ISkill[] {
    return this.getAll().filter(skill => {
      try {
        return skill.canHandle(context);
      } catch {
        // canHandle debe ser seguro; si falla, excluir la skill
        return false;
      }
    });
  }
}
