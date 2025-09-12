import type {
  AfterMiddlewareHandler,
  BeforeMiddlewareHandler,
  DefaultVectorTypes,
  VectorRequest,
  VectorTypes,
} from "../types";

export class MiddlewareManager<
  TTypes extends VectorTypes = DefaultVectorTypes
> {
  private beforeHandlers: BeforeMiddlewareHandler<TTypes>[] = [];
  private finallyHandlers: AfterMiddlewareHandler<TTypes>[] = [];

  addBefore(...handlers: BeforeMiddlewareHandler<TTypes>[]): void {
    this.beforeHandlers.push(...handlers);
  }

  addFinally(...handlers: AfterMiddlewareHandler<TTypes>[]): void {
    this.finallyHandlers.push(...handlers);
  }

  async executeBefore(
    request: VectorRequest<TTypes>
  ): Promise<VectorRequest<TTypes> | Response> {
    let currentRequest = request;

    for (const handler of this.beforeHandlers) {
      const result = await handler(currentRequest);

      if (result instanceof Response) {
        return result;
      }

      currentRequest = result;
    }

    return currentRequest;
  }

  async executeFinally(
    response: Response,
    request: VectorRequest<TTypes>
  ): Promise<Response> {
    let currentResponse = response;

    for (const handler of this.finallyHandlers) {
      currentResponse = await handler(currentResponse, request);
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
