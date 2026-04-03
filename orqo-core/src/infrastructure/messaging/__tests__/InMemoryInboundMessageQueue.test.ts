import { CanonicalMessageEnvelope } from '../../../domain/messaging/entities/CanonicalMessageEnvelope.js';
import { InMemoryInboundMessageQueue } from '../InMemoryInboundMessageQueue.js';

function makeEnvelope(externalMessageId: string) {
  const result = CanonicalMessageEnvelope.create({
    workspaceId: 'ws-1',
    channel: 'whatsapp',
    provider: 'meta',
    providerAccountId: 'phone-id-1',
    externalMessageId,
    senderExternalId: '573001234567',
    occurredAt: new Date('2026-03-31T21:00:00.000Z'),
    payload: { type: 'text', text: 'Hola ORQO' },
  });

  if (!result.ok) {
    throw result.error;
  }

  return result.value;
}

describe('InMemoryInboundMessageQueue', () => {
  it('deduplica mensajes por dedupeKey', async () => {
    const queue = new InMemoryInboundMessageQueue();
    const envelope = makeEnvelope('wamid.1');

    const first = await queue.enqueue(envelope);
    const duplicate = await queue.enqueue(envelope);

    expect(first.ok).toBe(true);
    expect(duplicate.ok).toBe(true);
    if (first.ok && duplicate.ok) {
      expect(duplicate.value.status).toBe('duplicate');
      expect(duplicate.value.jobId).toBe(first.value.jobId);
    }
    expect(queue.snapshot()).toEqual({ pending: 1, inflight: 0, deadLetter: 0 });
  });

  it('reencola jobs fallidos antes de moverlos a dead letter', async () => {
    const queue = new InMemoryInboundMessageQueue({
      maxAttempts: 2,
      baseRetryDelayMs: 0,
    });
    const enqueue = await queue.enqueue(makeEnvelope('wamid.2'));
    expect(enqueue.ok).toBe(true);
    if (!enqueue.ok) {
      throw enqueue.error;
    }

    const firstReserve = await queue.reserveNext();
    expect(firstReserve.ok).toBe(true);
    await queue.fail(enqueue.value.jobId, 'llm timeout');
    expect(queue.snapshot()).toEqual({ pending: 1, inflight: 0, deadLetter: 0 });

    const secondReserve = await queue.reserveNext();
    expect(secondReserve.ok).toBe(true);
    await queue.fail(enqueue.value.jobId, 'llm timeout');
    expect(queue.snapshot()).toEqual({ pending: 0, inflight: 0, deadLetter: 1 });
  });
});
