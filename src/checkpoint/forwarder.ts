export const CHECKPOINT_CONTEXT_HEADER = 'x-vector-checkpoint-context';

export type CheckpointContextPayload = Record<string, unknown>;

export class CheckpointForwarder {
  async forward(request: Request, socketPath: string, contextPayload?: CheckpointContextPayload): Promise<Response> {
    try {
      const encodedContext = encodeCheckpointContext(contextPayload);
      const headers = buildForwardHeaders(request.headers, encodedContext);

      const response = await fetch(request.url, {
        method: request.method,
        headers,
        body: request.body,
        unix: socketPath,
        // @ts-ignore - duplex required for streaming body
        duplex: request.body ? 'half' : undefined,
      } as any);

      // Clone the response so headers are mutable (fetch returns immutable headers).
      // This is required because the parent server applies CORS headers after forwarding.
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: new Headers(response.headers),
      });
    } catch (error) {
      console.error('[CheckpointForwarder] Forward failed:', error);
      return new Response(JSON.stringify({ error: true, message: 'Checkpoint unavailable', statusCode: 503 }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      });
    }
  }
}

function buildForwardHeaders(source: Headers, encodedContext: string | null): Headers {
  const headers = new Headers(source);
  stripHopByHopHeaders(headers);

  if (encodedContext) {
    headers.set(CHECKPOINT_CONTEXT_HEADER, encodedContext);
  }

  return headers;
}

function stripHopByHopHeaders(headers: Headers): void {
  const connectionValue = headers.get('connection');
  if (connectionValue) {
    for (const token of connectionValue.split(',')) {
      const normalized = token.trim().toLowerCase();
      if (normalized) {
        headers.delete(normalized);
      }
    }
  }

  headers.delete('connection');
  headers.delete('keep-alive');
  headers.delete('proxy-authenticate');
  headers.delete('proxy-authorization');
  headers.delete('te');
  headers.delete('trailer');
  headers.delete('transfer-encoding');
  headers.delete('upgrade');
}

function encodeCheckpointContext(contextPayload?: CheckpointContextPayload): string | null {
  if (!contextPayload) {
    return null;
  }

  const keys = Object.keys(contextPayload);
  if (keys.length === 0) {
    return null;
  }

  try {
    return Buffer.from(JSON.stringify(contextPayload), 'utf-8').toString('base64url');
  } catch {
    return null;
  }
}
