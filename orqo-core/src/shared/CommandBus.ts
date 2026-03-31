import type { Result } from './Result.js';

/** Marca de tipo — toda clase que implemente ICommand debe tener _type. */
export interface ICommand {
  readonly _type: string;
}

export interface ICommandHandler<C extends ICommand, R = void> {
  handle(command: C): Promise<Result<R>>;
}

export interface ICommandBus {
  dispatch<R>(command: ICommand): Promise<Result<R>>;
  register<C extends ICommand, R>(
    commandType: string,
    handler: ICommandHandler<C, R>,
  ): void;
}

export class InMemoryCommandBus implements ICommandBus {
  private readonly handlers = new Map<string, ICommandHandler<any, any>>();

  register<C extends ICommand, R>(
    commandType: string,
    handler: ICommandHandler<C, R>,
  ): void {
    if (this.handlers.has(commandType)) {
      throw new Error(`[CommandBus] Handler ya registrado para: ${commandType}`);
    }
    this.handlers.set(commandType, handler);
  }

  async dispatch<R>(command: ICommand): Promise<Result<R>> {
    const handler = this.handlers.get(command._type);
    if (!handler) {
      const { Err } = await import('./Result.js');
      return Err(new Error(`[CommandBus] Sin handler para: ${command._type}`));
    }
    return handler.handle(command) as Promise<Result<R>>;
  }
}
