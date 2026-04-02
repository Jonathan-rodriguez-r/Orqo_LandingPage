import { StructuredLogger, NoopLogger } from '../Logger.js';

function captureOutput(fn: () => void): string {
  const lines: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk: string | Uint8Array): boolean => {
    lines.push(String(chunk));
    return true;
  };
  try {
    fn();
  } finally {
    process.stdout.write = original;
  }
  return lines.join('');
}

describe('StructuredLogger (pretty mode)', () => {
  it('emite el mensaje al llamar info()', () => {
    const logger = new StructuredLogger('test', {}, 'info', true);
    const output = captureOutput(() => logger.info('Hola mundo'));
    expect(output).toContain('Hola mundo');
    expect(output).toContain('INFO');
  });

  it('emite el nivel correcto', () => {
    const logger = new StructuredLogger('test', {}, 'info', true);
    const warn = captureOutput(() => logger.warn('advertencia'));
    expect(warn).toContain('WARN');

    const err = captureOutput(() => logger.error('error grave'));
    expect(err).toContain('ERROR');
  });

  it('no emite mensajes por debajo del nivel mínimo', () => {
    const logger = new StructuredLogger('test', {}, 'warn', true);
    const output = captureOutput(() => {
      logger.debug('oculto');
      logger.info('también oculto');
    });
    expect(output).toBe('');
  });

  it('incluye bindings del contexto en el output', () => {
    const logger = new StructuredLogger('test', { workspaceId: 'ws-1' }, 'info', true);
    const output = captureOutput(() => logger.info('mensaje'));
    expect(output).toContain('ws-1');
  });

  it('child logger hereda bindings', () => {
    const parent = new StructuredLogger('test', {}, 'info', true);
    const child = parent.child({ correlationId: 'corr-123' });
    const output = captureOutput(() => child.info('desde hijo'));
    expect(output).toContain('corr-123');
    expect(output).toContain('desde hijo');
  });

  it('child logger puede añadir bindings adicionales', () => {
    const parent = new StructuredLogger('test', { service: 'orqo' }, 'info', true);
    const child = parent.child({ component: 'worker' });
    const output = captureOutput(() => child.info('test'));
    expect(output).toContain('orqo');
    expect(output).toContain('worker');
  });
});

describe('StructuredLogger (JSON mode)', () => {
  it('emite JSON válido', () => {
    const logger = new StructuredLogger('test', {}, 'info', false);
    const output = captureOutput(() => logger.info('mensaje JSON', { key: 'value' }));
    const parsed = JSON.parse(output.trim()) as Record<string, unknown>;
    expect(parsed['message']).toBe('mensaje JSON');
    expect(parsed['level']).toBe('info');
    expect(parsed['service']).toBe('test');
    expect(parsed['key']).toBe('value');
    expect(parsed['timestamp']).toBeDefined();
  });

  it('incluye contexto en el JSON', () => {
    const logger = new StructuredLogger('test', { workspaceId: 'ws-abc' }, 'info', false);
    const output = captureOutput(() => logger.error('fallo'));
    const parsed = JSON.parse(output.trim()) as Record<string, unknown>;
    expect(parsed['workspaceId']).toBe('ws-abc');
    expect(parsed['level']).toBe('error');
  });
});

describe('NoopLogger', () => {
  it('no emite nada', () => {
    const noop = new NoopLogger();
    const output = captureOutput(() => {
      noop.info('test');
      noop.warn('test');
      noop.error('test');
      noop.debug('test');
    });
    expect(output).toBe('');
  });

  it('child() retorna el mismo noop', () => {
    const noop = new NoopLogger();
    const child = noop.child({ key: 'value' });
    expect(child).toBe(noop);
  });
});
