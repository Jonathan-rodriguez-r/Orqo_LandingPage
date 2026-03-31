import { Conversation } from '../entities/Conversation.js';
import { PhoneNumber } from '../value-objects/PhoneNumber.js';
import { MessageReceived } from '../events/MessageReceived.js';
import { AgentResponseGenerated } from '../events/AgentResponseGenerated.js';

function makePhone(): PhoneNumber {
  const r = PhoneNumber.create('573001234567');
  if (!r.ok) throw new Error('Phone inválido en test');
  return r.value;
}

describe('Conversation aggregate', () => {
  it('crea una conversación sin mensajes', () => {
    const conv = Conversation.create('ws-1', makePhone(), 'agent-1');
    expect(conv.messageCount).toBe(0);
  });

  it('receiveUserMessage agrega el mensaje y genera MessageReceived', () => {
    const conv = Conversation.create('ws-1', makePhone(), 'agent-1');
    conv.receiveUserMessage('Hola');

    expect(conv.messageCount).toBe(1);

    const events = conv.pullDomainEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(MessageReceived);
  });

  it('addAgentResponse agrega la respuesta y genera AgentResponseGenerated', () => {
    const conv = Conversation.create('ws-1', makePhone(), 'agent-1');
    conv.receiveUserMessage('Hola');
    conv.pullDomainEvents(); // limpiar

    conv.addAgentResponse('Hola, soy ORQO.');

    expect(conv.messageCount).toBe(2);
    const events = conv.pullDomainEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(AgentResponseGenerated);
  });

  it('pullDomainEvents vacía la lista de eventos pendientes', () => {
    const conv = Conversation.create('ws-1', makePhone(), 'agent-1');
    conv.receiveUserMessage('Test');

    const first = conv.pullDomainEvents();
    const second = conv.pullDomainEvents();

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
  });

  it('getRecentHistory devuelve solo los últimos N turnos', () => {
    const conv = Conversation.create('ws-1', makePhone(), 'agent-1');
    for (let i = 0; i < 15; i++) {
      conv.receiveUserMessage(`msg ${i}`);
      conv.addAgentResponse(`resp ${i}`);
    }
    conv.pullDomainEvents();

    const history = conv.getRecentHistory(6);
    expect(history.length).toBeLessThanOrEqual(6);
  });
});

describe('PhoneNumber value object', () => {
  it('acepta número con guiones y espacios', () => {
    const r = PhoneNumber.create('+57 300-123-4567');
    expect(r.ok).toBe(true);
  });

  it('rechaza número demasiado corto', () => {
    const r = PhoneNumber.create('123');
    expect(r.ok).toBe(false);
  });

  it('compara por valor', () => {
    const a = PhoneNumber.create('573001234567');
    const b = PhoneNumber.create('57-300-123-4567');
    expect(a.ok && b.ok && a.value.equals(b.value)).toBe(true);
  });
});
