import type { ICommandHandler } from '../../../shared/CommandBus.js';
import { Err, Ok, type Result } from '../../../shared/Result.js';
import type { IInboundMessageQueue } from '../../ports/IInboundMessageQueue.js';
import type { IngestInboundMessageCommand } from './IngestInboundMessageCommand.js';

/**
 * Caso de uso de ingreso: desacopla el webhook del procesamiento de dominio.
 */
export class IngestInboundMessageHandler
  implements ICommandHandler<IngestInboundMessageCommand, string>
{
  constructor(
    private readonly inboundQueue: IInboundMessageQueue,
  ) {}

  async handle(
    command: IngestInboundMessageCommand,
  ): Promise<Result<string>> {
    const enqueueResult = await this.inboundQueue.enqueue(command.envelope);
    if (!enqueueResult.ok) {
      return Err(enqueueResult.error);
    }

    return Ok(enqueueResult.value.jobId);
  }
}
