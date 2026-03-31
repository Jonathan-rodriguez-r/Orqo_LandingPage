/** Marca de tipo — separa el lado de lectura del de escritura (CQRS). */
export interface IQuery<R> {
  readonly _type: string;
  readonly _returnType?: R; // phantom type para inferencia
}

export interface IQueryHandler<Q extends IQuery<R>, R> {
  handle(query: Q): Promise<R>;
}

export interface IQueryBus {
  ask<R>(query: IQuery<R>): Promise<R>;
  register<Q extends IQuery<R>, R>(
    queryType: string,
    handler: IQueryHandler<Q, R>,
  ): void;
}

export class InMemoryQueryBus implements IQueryBus {
  private readonly handlers = new Map<string, IQueryHandler<any, any>>();

  register<Q extends IQuery<R>, R>(
    queryType: string,
    handler: IQueryHandler<Q, R>,
  ): void {
    this.handlers.set(queryType, handler);
  }

  async ask<R>(query: IQuery<R>): Promise<R> {
    const handler = this.handlers.get(query._type);
    if (!handler) throw new Error(`[QueryBus] Sin handler para: ${query._type}`);
    return handler.handle(query) as Promise<R>;
  }
}
