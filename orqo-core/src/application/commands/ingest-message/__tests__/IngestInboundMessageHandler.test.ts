import { IngestInboundMessageHandler } from '../IngestInboundMessageHandler.js';
import { createIngestInboundMessageCommand } from '../IngestInboundMessageCommand.js';
import { CanonicalMessageEnvelope } from '../../../../domain/messaging/entities/CanonicalMessageEnvelope.js';
import type { IInboundMessageQueue } from '../../../ports/IInboundMessageQueue.js';
import { Ok } from '../../../../shared/Result.js';

describe('IngestInboundMessageHandler', () => {
  it('encola el envelope canónico y devuelve el jobId', async () => {
    const queue: IInboundMessageQueue = {
      enqueue: jest.fn().mockResolvedValue(
        Ok({
          jobId: 'job-123',
          dedupeKey: 'whatsapp:meta:ws-1:wamid.1',
          status: 'queued',
        }),
      ),
      reserveNext: jest.fn(),
      complete: jest.fn(),
      fail: jest.fn(),
      stats: jest.fn().mockResolvedValue({ pending: 0, processing: 0, deadLetter: 0 }),
    };

    const envelopeResult = CanonicalMessageEnvelope.create({
      workspaceId: 'ws-1',
      providerAccountId: 'phone-id-1',
      externalMessageId: 'wamid.1',
      customerPhone: '573001234567',
      occurredAt: new Date('2026-03-31T21:00:00.000Z'),
      payload: { type: 'text', text: 'Hola ORQO' },
    });

    expect(envelopeResult.ok).toBe(true);
    if (!envelopeResult.ok) {
      throw envelopeResult.error;
    }

    const handler = new IngestInboundMessageHandler(queue);
    const command = createIngestInboundMessageCommand(envelopeResult.value);

    const result = await handler.handle(command);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe('job-123');
    }
    expect(queue.enqueue).toHaveBeenCalledWith(envelopeResult.value);
  });
});
