import type { IOutboundGateway } from '../../application/ports/IOutboundGateway.js';
import type { CanonicalChannel } from '../../domain/messaging/entities/CanonicalMessageEnvelope.js';

/**
 * Registro de gateways de salida. Resuelve el gateway correcto por canal.
 */
export class OutboundGatewayRegistry {
  private readonly gateways: IOutboundGateway[];

  constructor(gateways: IOutboundGateway[]) {
    this.gateways = gateways;
  }

  resolve(channel: CanonicalChannel): IOutboundGateway {
    const gw = this.gateways.find(g => g.canHandle(channel));
    if (!gw) throw new Error(`No hay outbound gateway para canal: ${channel}`);
    return gw;
  }
}
