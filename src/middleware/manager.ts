import type {
  AfterMiddlewareHandler,
  BeforeMiddlewareHandler,
  DefaultVectorTypes,
  VectorContext,
  VectorTypes,
} from '../types';

export class MiddlewareManager<TTypes extends VectorTypes = DefaultVectorTypes> {
  private beforeHandlers: BeforeMiddlewareHandler<TTypes>[] = [];
  private finallyHandlers: AfterMiddlewareHandler<TTypes>[] = [];

  addBefore(...handlers: BeforeMiddlewareHandler<TTypes>[]): void {
    this.beforeHandlers.push(...handlers);
  }

  addFinally(...handlers: AfterMiddlewareHandler<TTypes>[]): void {
    this.finallyHandlers.push(...handlers);
  }

  async executeBefore(context: VectorContext<TTypes>): Promise<Response | null> {
    if (this.beforeHandlers.length === 0) return null;

    for (const handler of this.beforeHandlers) {
      const result = await handler(context);

      if (result instanceof Response) {
        return result;
      }

      if (result !== undefined) {
        throw new TypeError('Before middleware must return void or Response');
      }
    }

    return null;
  }

  async executeFinally(response: Response, context: VectorContext<TTypes>): Promise<Response> {
    if (this.finallyHandlers.length === 0) return response;

    let currentResponse = response;

    for (const handler of this.finallyHandlers) {
      try {
        currentResponse = await handler(currentResponse, context);
      } catch (error) {
        // Log but don't throw - we don't want to break the response chain
        console.error('After middleware error:', error);
        // Continue with the current response
      }
    }

    return currentResponse;
  }

  clone(): MiddlewareManager<TTypes> {
    const manager = new MiddlewareManager<TTypes>();
    manager.beforeHandlers = [...this.beforeHandlers];
    manager.finallyHandlers = [...this.finallyHandlers];
    return manager;
  }

  clear(): void {
    this.beforeHandlers = [];
    this.finallyHandlers = [];
  }
}
