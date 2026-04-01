import type { CanonicalMessageEnvelope } from '../../../domain/messaging/entities/CanonicalMessageEnvelope.js';
import type { ICommand } from '../../../shared/CommandBus.js';

export interface IngestInboundMessageCommand extends ICommand {
  readonly _type: 'IngestInboundMessage';
  readonly envelope: CanonicalMessageEnvelope;
}

export function createIngestInboundMessageCommand(
  envelope: CanonicalMessageEnvelope,
): IngestInboundMessageCommand {
  return {
    _type: 'IngestInboundMessage',
    envelope,
  };
}
