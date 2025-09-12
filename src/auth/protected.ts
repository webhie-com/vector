import type {
  DefaultVectorTypes,
  GetAuthType,
  ProtectedHandler,
  VectorRequest,
  VectorTypes,
} from '../types';

export class AuthManager<TTypes extends VectorTypes = DefaultVectorTypes> {
  private protectedHandler: ProtectedHandler<TTypes> | null = null;

  setProtectedHandler(handler: ProtectedHandler<TTypes>) {
    this.protectedHandler = handler;
  }

  async authenticate(request: VectorRequest<TTypes>): Promise<GetAuthType<TTypes> | null> {
    if (!this.protectedHandler) {
      throw new Error(
        'Protected handler not configured. Use vector.protected() to set authentication handler.'
      );
    }

    try {
      const authUser = await this.protectedHandler(request);
      request.authUser = authUser;
      return authUser;
    } catch (error) {
      throw new Error(
        `Authentication failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  isAuthenticated(request: VectorRequest<TTypes>): boolean {
    return !!request.authUser;
  }

  getUser(request: VectorRequest<TTypes>): GetAuthType<TTypes> | null {
    return request.authUser || null;
  }
}
