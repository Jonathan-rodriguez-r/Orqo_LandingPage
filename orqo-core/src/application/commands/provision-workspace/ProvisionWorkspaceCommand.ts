export interface ProvisionWorkspaceCommand {
  readonly type: 'ProvisionWorkspace';
  readonly name: string;
  readonly agentName?: string;
  readonly plan?: string;
  readonly timezone?: string;
  readonly trialDays?: number;
}

export function createProvisionWorkspaceCommand(
  params: Omit<ProvisionWorkspaceCommand, 'type'>,
): ProvisionWorkspaceCommand {
  return { type: 'ProvisionWorkspace', ...params };
}
