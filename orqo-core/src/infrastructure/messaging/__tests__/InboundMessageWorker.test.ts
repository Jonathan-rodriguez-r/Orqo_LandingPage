import type { ICommandBus } from '../../../shared/CommandBus.js';
import { Ok, Err } from '../../../shared/Result.js';
import { CanonicalMessageEnvelope } from '../../../domain/messaging/entities/CanonicalMessageEnvelope.js';
import { InMemoryInboundMessageQueue } from '../InMemoryInboundMessageQueue.js';
import { InboundMessageWorker } from '../InboundMessageWorker.js';

function makeEnvelope(externalMessageId: string) {
  const result = CanonicalMessageEnvelope.create({
    workspaceId: 'ws-1',
    channel: 'whatsapp',
    provider: 'meta',
    providerAccountId: 'phone-id-1',
    externalMessageId,
    senderExternalId: '573001234567',
    occurredAt: new Date('2026-03-31T21:00:00.000Z'),
    payload: { type: 'text', text: 'Necesito soporte' },
  });

  if (!result.ok) {
    throw result.error;
  }

  return result.value;
}

describe('InboundMessageWorker', () => {
  it('convierte jobs canonicos en ProcessIncomingMessage y los completa', async () => {
    const queue = new InMemoryInboundMessageQueue();
    await queue.enqueue(makeEnvelope('wamid.ok'));

    const commandBus: ICommandBus = {
      dispatch: jest.fn().mockResolvedValue(Ok('wamid.outbound.1')),
      register: jest.fn(),
    };

    const worker = new InboundMessageWorker(commandBus, queue);
    const result = await worker.drainOnce();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(1);
    }
    expect(commandBus.dispatch).toHaveBeenCalledTimes(1);
    expect(queue.snapshot()).toEqual({ pending: 0, inflight: 0, deadLetter: 0 });
  });

  it('reencola el job cuando el procesamiento falla y aun tiene retries', async () => {
    const queue = new InMemoryInboundMessageQueue();
    await queue.enqueue(makeEnvelope('wamid.fail'));

    const commandBus: ICommandBus = {
      dispatch: jest.fn().mockResolvedValue(Err(new Error('No hay agente activo'))),
      register: jest.fn(),
    };

    const worker = new InboundMessageWorker(commandBus, queue);
    const result = await worker.drainOnce();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(1);
    }
    expect(queue.snapshot()).toEqual({ pending: 1, inflight: 0, deadLetter: 0 });
  });
});
