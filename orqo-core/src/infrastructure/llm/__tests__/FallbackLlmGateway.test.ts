import { FallbackLlmGateway } from '../FallbackLlmGateway.js';
import { Ok, Err } from '../../../shared/Result.js';
import type { ILlmGateway, LlmResponse } from '../../../application/ports/ILlmGateway.js';

function makeGateway(response: ReturnType<typeof Ok<LlmResponse>> | ReturnType<typeof Err<Error>>): ILlmGateway {
  return {
    complete: jest.fn().mockResolvedValue(response),
  };
}

const okResponse: LlmResponse = {
  content: 'Hola',
  toolCalls: [],
  usage: { inputTokens: 10, outputTokens: 5 },
  model: 'claude-sonnet-4-6',
  provider: 'anthropic',
};

describe('FallbackLlmGateway', () => {
  it('retorna la respuesta del gateway principal si tiene éxito', async () => {
    const primary = makeGateway(Ok(okResponse));
    const fallback = makeGateway(Ok({ ...okResponse, content: 'Fallback' }));
    const gateway = new FallbackLlmGateway([primary, fallback]);

    const result = await gateway.complete([{ role: 'user', content: 'Hola' }]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.content).toBe('Hola');
    }
    expect(primary.complete).toHaveBeenCalledTimes(1);
    expect(fallback.complete).not.toHaveBeenCalled();
  });

  it('intenta el fallback si el principal falla', async () => {
    const primary = makeGateway(Err(new Error('rate limit')));
    const fallback = makeGateway(Ok({ ...okResponse, content: 'Desde fallback' }));
    const gateway = new FallbackLlmGateway([primary, fallback]);

    const result = await gateway.complete([{ role: 'user', content: 'Hola' }]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.content).toBe('Desde fallback');
    }
    expect(fallback.complete).toHaveBeenCalledTimes(1);
  });

  it('retorna el error del último gateway si todos fallan', async () => {
    const err1 = Err(new Error('error 1'));
    const err2 = Err(new Error('error 2'));
    const gateway = new FallbackLlmGateway([makeGateway(err1), makeGateway(err2)]);

    const result = await gateway.complete([{ role: 'user', content: 'Hola' }]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe('error 2');
    }
  });

  it('funciona con un solo gateway en la cadena', async () => {
    const primary = makeGateway(Ok(okResponse));
    const gateway = new FallbackLlmGateway([primary]);

    const result = await gateway.complete([{ role: 'user', content: 'Test' }]);
    expect(result.ok).toBe(true);
  });

  it('lanza al construir con cadena vacía', () => {
    expect(() => new FallbackLlmGateway([])).toThrow();
  });

  it('prueba múltiples fallbacks en orden', async () => {
    const g1 = makeGateway(Err(new Error('g1 fallo')));
    const g2 = makeGateway(Err(new Error('g2 fallo')));
    const g3 = makeGateway(Ok(okResponse));
    const gateway = new FallbackLlmGateway([g1, g2, g3]);

    const result = await gateway.complete([{ role: 'user', content: 'Test' }]);
    expect(result.ok).toBe(true);
    expect(g3.complete).toHaveBeenCalledTimes(1);
  });
});
