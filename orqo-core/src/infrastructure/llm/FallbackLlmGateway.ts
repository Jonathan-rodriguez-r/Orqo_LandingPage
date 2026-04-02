import { Err, type Result } from '../../shared/Result.js';
import type {
  ILlmGateway,
  LlmMessage,
  LlmOptions,
  LlmResponse,
} from '../../application/ports/ILlmGateway.js';
import type { ILogger } from '../../shared/Logger.js';
import { NoopLogger } from '../../shared/Logger.js';

/**
 * Gateway que intenta proveedores en orden hasta que uno responda con éxito.
 *
 * Si el gateway principal falla (error de red, rate limit, quota), pasa al
 * siguiente de la lista. Si todos fallan, retorna el error del último intento.
 */
export class FallbackLlmGateway implements ILlmGateway {
  constructor(
    /** Lista ordenada de gateways: [primary, fallback1, fallback2, ...] */
    private readonly chain: ILlmGateway[],
    private readonly logger: ILogger = new NoopLogger(),
  ) {
    if (chain.length === 0) {
      throw new Error('FallbackLlmGateway requiere al menos un gateway en la cadena');
    }
  }

  async complete(
    messages: LlmMessage[],
    options: LlmOptions = {},
  ): Promise<Result<LlmResponse>> {
    let lastError: Error = new Error('No hay gateways configurados');

    for (const [index, gateway] of this.chain.entries()) {
      const result = await gateway.complete(messages, options);

      if (result.ok) {
        return result;
      }

      lastError = result.error;

      const isLast = index === this.chain.length - 1;
      if (!isLast) {
        this.logger.warn('Gateway LLM falló, intentando fallback', {
          gatewayIndex: index,
          nextIndex: index + 1,
          error: result.error.message,
        });
      }
    }

    return Err(lastError);
  }
}
