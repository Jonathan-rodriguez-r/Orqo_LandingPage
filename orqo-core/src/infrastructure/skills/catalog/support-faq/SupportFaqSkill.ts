import { Ok, type Result } from '../../../../shared/Result.js';
import type { ISkill, SkillContext, SkillResult } from '../../../../domain/skill/ISkill.js';
import type { SkillManifest } from '../../../../domain/skill/SkillManifest.js';

export interface FaqEntry {
  keywords: string[];
  answer: string;
}

/**
 * Skill: Soporte y FAQ
 *
 * Skill pura (sin MCP). Responde preguntas frecuentes usando una base de
 * conocimiento configurable. Es el fallback de último recurso.
 *
 * Extensión sin modificar el core:
 *   new SupportFaqSkill([
 *     { keywords: ['horario', 'abierto'], answer: 'Atendemos L-V 9am-6pm' },
 *   ])
 */
export class SupportFaqSkill implements ISkill {
  readonly manifest: SkillManifest = {
    id: 'support-faq',
    name: 'Soporte y FAQ',
    description:
      'Responde preguntas generales sobre el negocio: horarios, políticas de devolución, ' +
      'información de contacto, preguntas frecuentes. Úsala cuando no aplique ninguna otra herramienta.',
    version: '1.0.0',
    author: 'Bacata Digital Media',
    tags: ['support', 'faq', 'general'],
    triggers: [{ type: 'always' }],
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'La pregunta del usuario' },
      },
    },
  };

  constructor(private readonly faqs: FaqEntry[] = []) {}

  canHandle(_context: SkillContext): boolean {
    // Siempre disponible como fallback
    return true;
  }

  async execute(context: SkillContext): Promise<Result<SkillResult>> {
    const lower = context.message.toLowerCase();

    const match = this.faqs.find(faq =>
      faq.keywords.some(kw => lower.includes(kw.toLowerCase())),
    );

    if (match) {
      return Ok({ content: match.answer });
    }

    return Ok({
      content:
        'Gracias por tu mensaje. Un asesor de nuestro equipo te atenderá pronto. ' +
        '¿Hay algo más en lo que pueda ayudarte mientras tanto?',
    });
  }
}
