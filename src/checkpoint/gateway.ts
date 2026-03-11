import type { CheckpointResolver } from './resolver';
import type { CheckpointContextPayload, CheckpointForwarder } from './forwarder';

export class CheckpointGateway {
  private resolver: CheckpointResolver;
  private forwarder: CheckpointForwarder;

  constructor(resolver: CheckpointResolver, forwarder: CheckpointForwarder) {
    this.resolver = resolver;
    this.forwarder = forwarder;
  }

  getRequestedVersion(request: Request): string | null {
    return this.resolver.getRequestedVersion(request);
  }

  getCacheKeyOverrideValue(request: Request): string | null {
    return this.resolver.getCacheKeyOverrideValue(request);
  }

  async handle(request: Request, contextPayload?: CheckpointContextPayload): Promise<Response | null> {
    const requestedVersion = this.getRequestedVersion(request);
    const socketPath = await this.resolver.resolve(request);
    if (!socketPath) {
      if (requestedVersion) {
        return new Response(
          JSON.stringify({
            error: true,
            message: `Requested checkpoint version "${requestedVersion}" is unavailable`,
            statusCode: 503,
          }),
          { status: 503, headers: { 'content-type': 'application/json' } }
        );
      }
      return null;
    }

    return await this.forwarder.forward(request, socketPath, contextPayload);
  }
}
