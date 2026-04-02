import { WorkspaceRateLimiter } from '../WorkspaceRateLimiter.js';

describe('WorkspaceRateLimiter', () => {
  it('permite requests dentro del límite', () => {
    const limiter = new WorkspaceRateLimiter(60_000);
    for (let i = 0; i < 5; i++) {
      expect(limiter.allow('ws-1', 10)).toBe(true);
    }
  });

  it('bloquea al superar el límite en la ventana', () => {
    const limiter = new WorkspaceRateLimiter(60_000);
    for (let i = 0; i < 10; i++) {
      limiter.allow('ws-1', 10);
    }
    expect(limiter.allow('ws-1', 10)).toBe(false);
  });

  it('aísla workspaces distintos', () => {
    const limiter = new WorkspaceRateLimiter(60_000);
    for (let i = 0; i < 10; i++) {
      limiter.allow('ws-1', 10);
    }
    // ws-2 no debe estar bloqueado
    expect(limiter.allow('ws-2', 10)).toBe(true);
  });

  it('evict limpia entradas inactivas', () => {
    const limiter = new WorkspaceRateLimiter(1); // ventana de 1ms
    limiter.allow('ws-1', 10);
    // Esperar que expire la ventana
    return new Promise<void>(resolve => {
      setTimeout(() => {
        limiter.evict();
        // Después del evict, debe poder volver a pasar
        expect(limiter.allow('ws-1', 10)).toBe(true);
        resolve();
      }, 10);
    });
  });
});
