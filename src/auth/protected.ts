import type { DefaultVectorTypes, GetAuthType, ProtectedHandler, VectorContext, VectorTypes } from '../types';

export class AuthManager<TTypes extends VectorTypes = DefaultVectorTypes> {
  private protectedHandler: ProtectedHandler<TTypes> | null = null;

  setProtectedHandler(handler: ProtectedHandler<TTypes>) {
    this.protectedHandler = handler;
  }

  clearProtectedHandler() {
    this.protectedHandler = null;
  }

  async authenticate(context: VectorContext<TTypes>): Promise<GetAuthType<TTypes> | null> {
    if (!this.protectedHandler) {
      throw new Error('Protected handler not configured. Use vector.protected() to set authentication handler.');
    }
    if (!context || typeof context !== 'object' || !(context as any).request) {
      throw new Error('Authentication context is invalid: missing request');
    }

    try {
      const authUser = await this.protectedHandler(context);
      context.authUser = authUser;
      return authUser;
    } catch (error) {
      throw new Error(`Authentication failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  isAuthenticated(context: VectorContext<TTypes>): boolean {
    return !!context.authUser;
  }

  getUser(context: VectorContext<TTypes>): GetAuthType<TTypes> | null {
    return context.authUser || null;
  }
}
