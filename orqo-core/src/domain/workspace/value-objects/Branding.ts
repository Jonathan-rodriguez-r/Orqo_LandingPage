import { Err, Ok, type Result } from '../../../shared/Result.js';

/** Personalización visual y de voz del agente por workspace. */
export interface BrandingProps {
  /** Nombre que el agente usa para presentarse. */
  agentName: string;
  /** URL del logo (HTTPS). Opcional. */
  logoUrl?: string;
  /** Color primario en hex (#RRGGBB). Opcional. */
  primaryColor?: string;
  /** Mensaje de bienvenida al iniciar conversación. */
  welcomeMessage: string;
}

export class Branding {
  readonly agentName: string;
  readonly logoUrl: string | undefined;
  readonly primaryColor: string | undefined;
  readonly welcomeMessage: string;

  private constructor(props: BrandingProps) {
    this.agentName = props.agentName;
    this.logoUrl = props.logoUrl;
    this.primaryColor = props.primaryColor;
    this.welcomeMessage = props.welcomeMessage;
  }

  static create(props: BrandingProps): Result<Branding> {
    if (!props.agentName.trim()) {
      return Err(new Error('agentName no puede estar vacío'));
    }
    if (props.agentName.length > 64) {
      return Err(new Error('agentName excede 64 caracteres'));
    }
    if (props.logoUrl && !/^https:\/\/.+/.test(props.logoUrl)) {
      return Err(new Error('logoUrl debe ser HTTPS'));
    }
    if (props.primaryColor && !/^#[0-9A-Fa-f]{6}$/.test(props.primaryColor)) {
      return Err(new Error('primaryColor debe ser formato #RRGGBB'));
    }
    if (!props.welcomeMessage.trim()) {
      return Err(new Error('welcomeMessage no puede estar vacío'));
    }
    if (props.welcomeMessage.length > 1_000) {
      return Err(new Error('welcomeMessage excede 1000 caracteres'));
    }
    return Ok(new Branding(props));
  }

  static default(agentName: string): Branding {
    return new Branding({
      agentName,
      welcomeMessage: `Hola, soy ${agentName}. ¿En qué puedo ayudarte hoy?`,
    });
  }

  toJSON(): BrandingProps {
    return {
      agentName: this.agentName,
      welcomeMessage: this.welcomeMessage,
      ...(this.logoUrl !== undefined ? { logoUrl: this.logoUrl } : {}),
      ...(this.primaryColor !== undefined ? { primaryColor: this.primaryColor } : {}),
    };
  }
}
