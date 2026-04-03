export type ChannelType = 'whatsapp' | 'instagram' | 'facebook';

export interface WhatsAppChannelConfig {
  phoneNumberId: string;       // Meta phone number ID (routing key)
  encryptedToken: string;      // AES-256-GCM encrypted access token
  tokenPrefix: string;         // first 12 chars for UI display
}

export interface InstagramChannelConfig {
  igAccountId: string;         // Instagram account ID (routing key)
  encryptedToken: string;
  tokenPrefix: string;
}

export interface FacebookChannelConfig {
  pageId: string;              // Facebook page ID (routing key)
  encryptedToken: string;
  tokenPrefix: string;
}

export interface WorkspaceChannelConfigProps {
  workspaceId: string;
  whatsapp?: WhatsAppChannelConfig;
  instagram?: InstagramChannelConfig;
  facebook?: FacebookChannelConfig;
  updatedAt: Date;
}

export class WorkspaceChannelConfig {
  readonly workspaceId: string;
  readonly whatsapp: WhatsAppChannelConfig | undefined;
  readonly instagram: InstagramChannelConfig | undefined;
  readonly facebook: FacebookChannelConfig | undefined;
  readonly updatedAt: Date;

  private constructor(props: WorkspaceChannelConfigProps) {
    this.workspaceId = props.workspaceId;
    this.updatedAt = props.updatedAt;
    // use conditional assignment for exactOptionalPropertyTypes
    if (props.whatsapp !== undefined) this.whatsapp = props.whatsapp;
    if (props.instagram !== undefined) this.instagram = props.instagram;
    if (props.facebook !== undefined) this.facebook = props.facebook;
  }

  static create(workspaceId: string): WorkspaceChannelConfig {
    return new WorkspaceChannelConfig({ workspaceId, updatedAt: new Date() });
  }

  static reconstitute(props: WorkspaceChannelConfigProps): WorkspaceChannelConfig {
    return new WorkspaceChannelConfig(props);
  }

  withWhatsApp(config: WhatsAppChannelConfig): WorkspaceChannelConfig {
    return new WorkspaceChannelConfig({ ...this._toProps(), whatsapp: config, updatedAt: new Date() });
  }

  withInstagram(config: InstagramChannelConfig): WorkspaceChannelConfig {
    return new WorkspaceChannelConfig({ ...this._toProps(), instagram: config, updatedAt: new Date() });
  }

  withFacebook(config: FacebookChannelConfig): WorkspaceChannelConfig {
    return new WorkspaceChannelConfig({ ...this._toProps(), facebook: config, updatedAt: new Date() });
  }

  withoutChannel(channel: ChannelType): WorkspaceChannelConfig {
    const props = this._toProps();
    if (channel === 'whatsapp') { delete (props as Partial<WorkspaceChannelConfigProps>).whatsapp; }
    if (channel === 'instagram') { delete (props as Partial<WorkspaceChannelConfigProps>).instagram; }
    if (channel === 'facebook') { delete (props as Partial<WorkspaceChannelConfigProps>).facebook; }
    return new WorkspaceChannelConfig({ ...props, updatedAt: new Date() });
  }

  private _toProps(): WorkspaceChannelConfigProps {
    return {
      workspaceId: this.workspaceId,
      updatedAt: this.updatedAt,
      ...(this.whatsapp !== undefined ? { whatsapp: this.whatsapp } : {}),
      ...(this.instagram !== undefined ? { instagram: this.instagram } : {}),
      ...(this.facebook !== undefined ? { facebook: this.facebook } : {}),
    };
  }

  toPublic(): object {
    // Returns channel info for API responses — never exposes encryptedToken
    return {
      workspaceId: this.workspaceId,
      updatedAt: this.updatedAt,
      ...(this.whatsapp !== undefined ? { whatsapp: { phoneNumberId: this.whatsapp.phoneNumberId, tokenPrefix: this.whatsapp.tokenPrefix } } : {}),
      ...(this.instagram !== undefined ? { instagram: { igAccountId: this.instagram.igAccountId, tokenPrefix: this.instagram.tokenPrefix } } : {}),
      ...(this.facebook !== undefined ? { facebook: { pageId: this.facebook.pageId, tokenPrefix: this.facebook.tokenPrefix } } : {}),
    };
  }
}
