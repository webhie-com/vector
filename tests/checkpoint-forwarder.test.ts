import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, promises as fs, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { CHECKPOINT_CONTEXT_HEADER, CheckpointForwarder } from '../src/checkpoint/forwarder';

const TEST_DIR = join(process.cwd(), '.vector/test-forwarder');
const SOCKET_PATH = join(TEST_DIR, 'test.sock');

async function cleanup() {
  if (existsSync(TEST_DIR)) {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  }
}

describe('CheckpointForwarder', () => {
  let forwarder: CheckpointForwarder;
  let server: ReturnType<typeof Bun.serve> | null = null;

  beforeEach(async () => {
    await cleanup();
    await fs.mkdir(TEST_DIR, { recursive: true });
    forwarder = new CheckpointForwarder();
  });

  afterEach(async () => {
    if (server) {
      server.stop();
      server = null;
    }
    await cleanup();
  });

  function startSocketServer() {
    if (existsSync(SOCKET_PATH)) {
      unlinkSync(SOCKET_PATH);
    }

    server = Bun.serve({
      unix: SOCKET_PATH,
      routes: {
        '/test': {
          GET: () => Response.json({ message: 'hello from checkpoint' }),
        },
        '/echo-headers': {
          GET: (req: Request) => {
            const headers: Record<string, string> = {};
            req.headers.forEach((value, key) => {
              headers[key] = value;
            });
            return Response.json({ headers });
          },
        },
      },
      fetch() {
        return Response.json({ error: 'not found' }, { status: 404 });
      },
    });
  }

  it('forwards GET request and returns response', async () => {
    startSocketServer();

    const request = new Request('http://localhost/test');
    const response = await forwarder.forward(request, SOCKET_PATH);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.message).toBe('hello from checkpoint');
  });

  it('returns 503 when socket is unreachable', async () => {
    const request = new Request('http://localhost/test');
    const response = await forwarder.forward(request, '/nonexistent/socket.sock');

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error).toBe(true);
    expect(body.message).toBe('Checkpoint unavailable');
  });

  it('strips hop-by-hop headers', async () => {
    const originalFetch = globalThis.fetch;
    let seenHeaders: Headers | null = null;
    (globalThis as any).fetch = async (_url: string, init?: RequestInit) => {
      seenHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    try {
      const request = new Request('http://localhost/echo-headers', {
        headers: {
          'content-type': 'application/json',
          connection: 'keep-alive, transfer-encoding',
          'keep-alive': 'timeout=5',
          'transfer-encoding': 'chunked',
          'x-custom': 'preserved',
        },
      });

      const response = await forwarder.forward(request, SOCKET_PATH);
      expect(response.status).toBe(200);
      expect(seenHeaders).not.toBeNull();

      // Custom and standard headers are preserved
      expect(seenHeaders!.get('x-custom')).toBe('preserved');
      expect(seenHeaders!.get('content-type')).toBe('application/json');

      // Hop-by-hop headers must be stripped before forwarding
      expect(seenHeaders!.get('connection')).toBeNull();
      expect(seenHeaders!.get('keep-alive')).toBeNull();
      expect(seenHeaders!.get('transfer-encoding')).toBeNull();
    } finally {
      (globalThis as any).fetch = originalFetch;
    }
  });

  it('preserves request method', async () => {
    if (existsSync(SOCKET_PATH)) unlinkSync(SOCKET_PATH);

    server = Bun.serve({
      unix: SOCKET_PATH,
      routes: {
        '/test': {
          POST: async (req: Request) => {
            const body = await req.json();
            return Response.json({ method: 'POST', received: body });
          },
        },
      },
      fetch() {
        return Response.json({ error: 'not found' }, { status: 404 });
      },
    });

    const request = new Request('http://localhost/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data: 'test' }),
    });

    const response = await forwarder.forward(request, SOCKET_PATH);
    const body = await response.json();
    expect(body.method).toBe('POST');
    expect(body.received).toEqual({ data: 'test' });
  });

  it('returns response with mutable headers (CORS-safe)', async () => {
    startSocketServer();

    const request = new Request('http://localhost/test');
    const response = await forwarder.forward(request, SOCKET_PATH);

    // Headers must be mutable so applyCors can set CORS headers
    expect(() => response.headers.set('x-test', 'value')).not.toThrow();
    expect(response.headers.get('x-test')).toBe('value');
  });

  it('503 response includes statusCode in body', async () => {
    const request = new Request('http://localhost/test');
    const response = await forwarder.forward(request, '/nonexistent/socket.sock');

    const body = await response.json();
    expect(body.statusCode).toBe(503);
  });

  it('forwards DELETE request', async () => {
    if (existsSync(SOCKET_PATH)) unlinkSync(SOCKET_PATH);

    server = Bun.serve({
      unix: SOCKET_PATH,
      routes: {
        '/resource': {
          DELETE: () => new Response(null, { status: 204 }),
        },
      },
      fetch() {
        return Response.json({ error: 'not found' }, { status: 404 });
      },
    });

    const request = new Request('http://localhost/resource', { method: 'DELETE' });
    const response = await forwarder.forward(request, SOCKET_PATH);
    expect(response.status).toBe(204);
  });

  it('preserves response status code from checkpoint', async () => {
    if (existsSync(SOCKET_PATH)) unlinkSync(SOCKET_PATH);

    server = Bun.serve({
      unix: SOCKET_PATH,
      routes: {
        '/created': {
          POST: () => Response.json({ id: 1 }, { status: 201 }),
        },
      },
      fetch() {
        return Response.json({ error: 'not found' }, { status: 404 });
      },
    });

    const request = new Request('http://localhost/created', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'test' }),
    });
    const response = await forwarder.forward(request, SOCKET_PATH);
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.id).toBe(1);
  });

  it('adds serialized checkpoint context header when payload is provided', async () => {
    const originalFetch = globalThis.fetch;
    let capturedHeader: string | null = null;

    (globalThis as any).fetch = async (_url: string, init?: RequestInit) => {
      capturedHeader = new Headers(init?.headers).get(CHECKPOINT_CONTEXT_HEADER);
      return new Response('ok', { status: 200 });
    };

    try {
      const request = new Request('http://localhost/test');
      const response = await forwarder.forward(request, SOCKET_PATH, {
        traceId: 'trace-123',
        metadata: { fromBefore: true },
      });

      expect(response.status).toBe(200);
      expect(capturedHeader).not.toBeNull();

      const decoded = JSON.parse(Buffer.from(capturedHeader!, 'base64url').toString('utf-8'));
      expect(decoded).toEqual({
        traceId: 'trace-123',
        metadata: { fromBefore: true },
      });
    } finally {
      (globalThis as any).fetch = originalFetch;
    }
  });

  it('does not add checkpoint context header when payload is empty', async () => {
    const originalFetch = globalThis.fetch;
    let capturedHeader: string | null = null;

    (globalThis as any).fetch = async (_url: string, init?: RequestInit) => {
      capturedHeader = new Headers(init?.headers).get(CHECKPOINT_CONTEXT_HEADER);
      return new Response('ok', { status: 200 });
    };

    try {
      const request = new Request('http://localhost/test');
      const response = await forwarder.forward(request, SOCKET_PATH, {});

      expect(response.status).toBe(200);
      expect(capturedHeader).toBeNull();
    } finally {
      (globalThis as any).fetch = originalFetch;
    }
  });
});
