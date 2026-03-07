import { describe, expect, it } from 'bun:test';
import { AuthManager } from '../src/auth/protected';
import { CacheManager } from '../src/cache/manager';
import { VectorRouter } from '../src/core/router';
import { MiddlewareManager } from '../src/middleware/manager';
import type { StandardSchemaV1 } from '../src/types';

function makeRouter() {
  const middleware = new MiddlewareManager();
  const auth = new AuthManager();
  const cache = new CacheManager();
  return {
    router: new VectorRouter(middleware, auth, cache),
    auth,
    cache,
    middleware,
  };
}

function jsonRequest(url: string, method = 'POST', body?: object) {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(method !== 'GET' && { body: body ? JSON.stringify(body) : undefined }),
  });
}

function standardSchema<TOutput = unknown>(
  validate: StandardSchemaV1<unknown, TOutput>['~standard']['validate']
): StandardSchemaV1<unknown, TOutput> {
  return {
    '~standard': {
      version: 1 as const,
      vendor: 'test',
      validate,
    },
  };
}

describe('Router — request body parsing', () => {
  it('parses JSON body on POST', async () => {
    const { router } = makeRouter();
    let captured: any;

    router.route({ method: 'POST', path: '/data', expose: true }, async (req) => {
      captured = req.content;
      return { ok: true };
    });

    await router.handle(jsonRequest('http://localhost/data', 'POST', { name: 'Alice' }));
    expect(captured).toEqual({ name: 'Alice' });
  });

  it('parses application/x-www-form-urlencoded body', async () => {
    const { router } = makeRouter();
    let captured: any;

    router.route({ method: 'POST', path: '/form', expose: true }, async (req) => {
      captured = req.content;
      return { ok: true };
    });

    const req = new Request('http://localhost/form', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'username=bob&age=30',
    });
    await router.handle(req);

    expect(captured).toMatchObject({ username: 'bob', age: '30' });
  });

  it('parses plain text body', async () => {
    const { router } = makeRouter();
    let captured: any;

    router.route({ method: 'POST', path: '/text', expose: true }, async (req) => {
      captured = req.content;
      return { ok: true };
    });

    const req = new Request('http://localhost/text', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'hello world',
    });
    await router.handle(req);

    expect(captured).toBe('hello world');
  });

  it('does not throw when content field is readonly during body parse', async () => {
    const { router } = makeRouter();
    let captured: any;

    router.route({ method: 'POST', path: '/readonly-content-parse', expose: true }, async (req) => {
      captured = {
        content: req.content,
        body: req.body,
      };
      return { ok: true };
    });

    const req = new Request('http://localhost/readonly-content-parse', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Alice' }),
    });
    Object.defineProperty(req, 'content', {
      value: 'locked',
      writable: false,
      configurable: true,
    });

    const res = await router.handle(req);

    expect(res.status).toBe(200);
    expect(captured.content).toBe('locked');
    expect(typeof captured.body?.getReader).toBe('function');
  });

  it('does not parse body for GET requests', async () => {
    const { router } = makeRouter();
    let captured: any = 'untouched';

    router.route({ method: 'GET', path: '/read', expose: true }, async (req) => {
      captured = req.content;
      return { ok: true };
    });

    await router.handle(new Request('http://localhost/read'));
    expect(captured).toBeUndefined();
  });

  it('skips parsing when rawRequest is true', async () => {
    const { router } = makeRouter();
    let captured: any = 'untouched';

    router.route({ method: 'POST', path: '/raw', expose: true, rawRequest: true }, async (req) => {
      captured = req.content;
      return new Response('ok');
    });

    await router.handle(jsonRequest('http://localhost/raw', 'POST', { x: 1 }));
    expect(captured).toBeUndefined();
  });
});

describe('Router — schema validation', () => {
  it('returns 422 with normalized issues when input validation fails', async () => {
    const { router } = makeRouter();
    let called = false;

    const input = standardSchema(async () => ({
      issues: [
        {
          message: 'Email is required',
          path: ['body', 'email'],
          code: 'required',
        },
      ],
    }));

    router.route(
      {
        method: 'POST',
        path: '/validate',
        expose: true,
        schema: { input },
      },
      async () => {
        called = true;
        return { ok: true };
      }
    );

    const res = await router.handle(jsonRequest('http://localhost/validate', 'POST', { email: '' }));
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(called).toBe(false);
    expect(body.message).toBe('Validation failed');
    expect(body.target).toBe('input');
    expect(body.issues[0]).toMatchObject({
      message: 'Email is required',
      path: ['body', 'email'],
      code: 'required',
    });
  });

  it('applies validated input output to request for handlers', async () => {
    const { router } = makeRouter();
    let validatedInput: any;

    const input = standardSchema(async (value) => {
      const payload = value as any;
      return {
        value: {
          ...payload,
          body: {
            name: String(payload.body?.name || '')
              .trim()
              .toUpperCase(),
          },
        },
      };
    });

    router.route(
      {
        method: 'POST',
        path: '/validate-pass',
        expose: true,
        schema: { input },
      },
      async (req) => {
        validatedInput = req.validatedInput;
        return { normalized: req.content.name };
      }
    );

    const res = await router.handle(
      jsonRequest('http://localhost/validate-pass', 'POST', {
        name: '  alice  ',
      })
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ normalized: 'ALICE' });
    expect(validatedInput.body.name).toBe('ALICE');
  });

  it('returns 500 when schema config is invalid', async () => {
    const { router } = makeRouter();

    router.route(
      {
        method: 'POST',
        path: '/invalid-schema',
        expose: true,
        schema: { input: {} as any },
      },
      async () => ({ ok: true })
    );

    const res = await router.handle(jsonRequest('http://localhost/invalid-schema', 'POST', {}));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.message).toBe('Invalid route schema configuration');
  });

  it('skips input validation when validate is explicitly false', async () => {
    const { router } = makeRouter();
    let rawValidateCalled = false;
    let parsedValidateCalled = false;

    const rawInput = standardSchema(async () => {
      rawValidateCalled = true;
      return { value: { body: { fromValidation: true } } };
    });

    const parsedInput = standardSchema(async () => {
      parsedValidateCalled = true;
      return { value: { body: { fromValidation: true } } };
    });

    router.route(
      {
        method: 'POST',
        path: '/raw-skip-validate',
        expose: true,
        rawRequest: true,
        validate: false,
        schema: { input: rawInput },
      },
      async () => ({ ok: true })
    );

    router.route(
      {
        method: 'POST',
        path: '/parsed-skip-validate',
        expose: true,
        validate: false,
        schema: { input: parsedInput },
      },
      async () => ({ ok: true })
    );

    const rawRes = await router.handle(jsonRequest('http://localhost/raw-skip-validate', 'POST', { a: 1 }));
    const parsedRes = await router.handle(jsonRequest('http://localhost/parsed-skip-validate', 'POST', { a: 1 }));

    expect(rawRes.status).toBe(200);
    expect(parsedRes.status).toBe(200);
    expect(rawValidateCalled).toBe(false);
    expect(parsedValidateCalled).toBe(false);
  });

  it('validates raw requests by default when schema.input exists', async () => {
    const { router } = makeRouter();
    let bodySeenByValidator: unknown;

    const input = standardSchema(async (value) => {
      const payload = value as any;
      bodySeenByValidator = payload.body;
      return {
        value: {
          ...payload,
          body: { parsed: true },
        },
      };
    });

    let contentSeenByHandler: any;
    router.route(
      {
        method: 'POST',
        path: '/raw-validate',
        expose: true,
        rawRequest: true,
        schema: { input },
      },
      async (req) => {
        contentSeenByHandler = req.content;
        return { ok: true };
      }
    );

    const res = await router.handle(jsonRequest('http://localhost/raw-validate', 'POST', { a: 1 }));
    expect(res.status).toBe(200);
    expect(typeof bodySeenByValidator).toBe('string');
    expect(contentSeenByHandler).toEqual({ parsed: true });
  });

  it('maps thrown validation issues to 422', async () => {
    const { router } = makeRouter();

    const input = standardSchema(async () => {
      throw {
        issues: [{ message: 'Broken payload', path: ['body'] }],
      };
    });

    router.route(
      {
        method: 'POST',
        path: '/throw-issues',
        expose: true,
        schema: { input },
      },
      async () => ({ ok: true })
    );

    const res = await router.handle(jsonRequest('http://localhost/throw-issues', 'POST', { a: 1 }));
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.message).toBe('Validation failed');
    expect(body.issues[0].message).toBe('Broken payload');
  });

  it('maps thrown cause.issues to 422', async () => {
    const { router } = makeRouter();

    const input = standardSchema(async () => {
      const error = new Error('wrapped');
      (error as any).cause = {
        issues: [{ message: 'Nested issue', path: ['query', 'q'] }],
      };
      throw error;
    });

    router.route(
      {
        method: 'POST',
        path: '/throw-cause-issues',
        expose: true,
        schema: { input },
      },
      async () => ({ ok: true })
    );

    const res = await router.handle(jsonRequest('http://localhost/throw-cause-issues', 'POST', { q: 1 }));
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.issues[0].message).toBe('Nested issue');
    expect(body.issues[0].path).toEqual(['query', 'q']);
  });

  it('passes headers and cookies into schema input payload', async () => {
    const { router } = makeRouter();
    let payloadSeenByValidator: any;

    const input = standardSchema(async (value) => {
      payloadSeenByValidator = value;
      return { value };
    });

    router.route(
      {
        method: 'POST',
        path: '/validate-headers-cookies',
        expose: true,
        schema: { input },
      },
      async () => ({ ok: true })
    );

    const res = await router.handle(
      new Request('http://localhost/validate-headers-cookies?page=2', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer abc',
          cookie: 'session=s1; theme=dark',
        },
        body: JSON.stringify({ name: 'alice' }),
      })
    );

    expect(res.status).toBe(200);
    expect(payloadSeenByValidator.query).toEqual({ page: '2' });
    expect(payloadSeenByValidator.cookies).toEqual({ session: 's1', theme: 'dark' });
    expect(payloadSeenByValidator.headers.authorization).toBe('Bearer abc');
    expect(payloadSeenByValidator.headers['content-type']).toBe('application/json');
  });

  it('returns 422 when header/cookie validation fails', async () => {
    const { router } = makeRouter();

    const input = standardSchema(async (value) => {
      const payload = value as any;
      const issues: Array<{ message: string; path: string[]; code: string }> = [];

      if (!payload.headers.authorization) {
        issues.push({
          message: 'Authorization header is required',
          path: ['headers', 'authorization'],
          code: 'required',
        });
      }

      if (!payload.cookies.session) {
        issues.push({
          message: 'Session cookie is required',
          path: ['cookies', 'session'],
          code: 'required',
        });
      }

      return issues.length ? { issues } : { value: payload };
    });

    router.route(
      {
        method: 'POST',
        path: '/validate-header-cookie-required',
        expose: true,
        schema: { input },
      },
      async () => ({ ok: true })
    );

    const res = await router.handle(
      new Request('http://localhost/validate-header-cookie-required', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
    );
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ['headers', 'authorization'], code: 'required' }),
        expect.objectContaining({ path: ['cookies', 'session'], code: 'required' }),
      ])
    );
  });

  it('normalizes header keys to lowercase in schema payload', async () => {
    const { router } = makeRouter();
    let payloadSeenByValidator: any;

    const input = standardSchema(async (value) => {
      payloadSeenByValidator = value;
      return { value };
    });

    router.route(
      {
        method: 'POST',
        path: '/validate-header-normalization',
        expose: true,
        schema: { input },
      },
      async () => ({ ok: true })
    );

    const res = await router.handle(
      new Request('http://localhost/validate-header-normalization', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: 'Bearer MixedCase',
          'X-Request-ID': 'req-1',
        },
        body: JSON.stringify({ ok: true }),
      })
    );

    expect(res.status).toBe(200);
    expect(payloadSeenByValidator.headers.authorization).toBe('Bearer MixedCase');
    expect(payloadSeenByValidator.headers['x-request-id']).toBe('req-1');
    expect(payloadSeenByValidator.headers.Authorization).toBeUndefined();
  });

  it('preserves duplicate header values as comma-joined strings in schema payload', async () => {
    const { router } = makeRouter();
    let payloadSeenByValidator: any;

    const input = standardSchema(async (value) => {
      payloadSeenByValidator = value;
      return { value };
    });

    router.route(
      {
        method: 'POST',
        path: '/validate-duplicate-headers',
        expose: true,
        schema: { input },
      },
      async () => ({ ok: true })
    );

    const headers = new Headers({ 'content-type': 'application/json' });
    headers.append('x-tag', 'a');
    headers.append('x-tag', 'b');

    const res = await router.handle(
      new Request('http://localhost/validate-duplicate-headers', {
        method: 'POST',
        headers,
        body: JSON.stringify({ ok: true }),
      })
    );

    expect(res.status).toBe(200);
    expect(payloadSeenByValidator.headers['x-tag']).toContain('a');
    expect(payloadSeenByValidator.headers['x-tag']).toContain('b');
  });

  it('parses cookies without decoding and uses last value for duplicate names', async () => {
    const { router } = makeRouter();
    let payloadSeenByValidator: any;

    const input = standardSchema(async (value) => {
      payloadSeenByValidator = value;
      return { value };
    });

    router.route(
      {
        method: 'POST',
        path: '/validate-cookie-parser',
        expose: true,
        schema: { input },
      },
      async () => ({ ok: true })
    );

    const res = await router.handle(
      new Request('http://localhost/validate-cookie-parser', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: 'session=first; badpair; encoded=a%20b; session=second; quoted="x y"',
        },
        body: JSON.stringify({ ok: true }),
      })
    );

    expect(res.status).toBe(200);
    expect(payloadSeenByValidator.cookies.session).toBe('second');
    expect(payloadSeenByValidator.cookies.encoded).toBe('a%20b');
    expect(payloadSeenByValidator.cookies.quoted).toBe('"x y"');
    expect(payloadSeenByValidator.cookies.badpair).toBeUndefined();
  });

  it('does not mutate req.headers when validated output includes headers', async () => {
    const { router } = makeRouter();
    let seenHeaderFromReq: string | null = null;
    let seenValidatedHeaders: any;

    const input = standardSchema(async (value) => {
      const payload = value as any;
      return {
        value: {
          ...payload,
          headers: {
            authorization: 'Bearer rewritten',
          },
        },
      };
    });

    router.route(
      {
        method: 'POST',
        path: '/validate-header-no-mutate',
        expose: true,
        schema: { input },
      },
      async (req) => {
        seenHeaderFromReq = req.headers.get('authorization');
        seenValidatedHeaders = (req.validatedInput as any)?.headers;
        return { ok: true };
      }
    );

    const res = await router.handle(
      new Request('http://localhost/validate-header-no-mutate', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer original',
        },
        body: JSON.stringify({ ok: true }),
      })
    );

    expect(res.status).toBe(200);
    expect(seenHeaderFromReq as unknown as string).toBe('Bearer original');
    expect(seenValidatedHeaders).toEqual({ authorization: 'Bearer rewritten' });
  });

  it('returns 422 for rawRequest schema when raw body fails validation', async () => {
    const { router } = makeRouter();

    const input = standardSchema(async (value) => {
      const payload = value as any;
      const rawBody = payload.body;
      if (typeof rawBody !== 'string' || !rawBody.trim().startsWith('{')) {
        return {
          issues: [{ message: 'Raw JSON body is required', path: ['body'], code: 'invalid_type' }],
        };
      }
      return { value: payload };
    });

    router.route(
      {
        method: 'POST',
        path: '/validate-raw-body-fail',
        expose: true,
        rawRequest: true,
        schema: { input },
      },
      async () => ({ ok: true })
    );

    const res = await router.handle(
      new Request('http://localhost/validate-raw-body-fail', {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: 'not-json',
      })
    );
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.target).toBe('input');
    expect(body.issues[0]).toMatchObject({
      path: ['body'],
      code: 'invalid_type',
    });
  });

  it('applies validator-provided body on GET requests', async () => {
    const { router } = makeRouter();
    let seenBody: any;

    const input = standardSchema(async (value) => {
      const payload = value as any;
      return {
        value: {
          ...payload,
          body: { injected: true, source: 'validator' },
        },
      };
    });

    router.route(
      {
        method: 'GET',
        path: '/schema-get-injected-body',
        expose: true,
        schema: { input },
      },
      async (req) => {
        seenBody = req.content;
        return { ok: true };
      }
    );

    const res = await router.handle(new Request('http://localhost/schema-get-injected-body?page=1'));
    expect(res.status).toBe(200);
    expect(seenBody).toEqual({ injected: true, source: 'validator' });
  });

  it('does not fail when validated output targets readonly request fields', async () => {
    const { router } = makeRouter();
    let captured: any;

    const input = standardSchema(async () => ({
      value: {
        params: { id: '999' },
        query: { page: 2 },
        cookies: { session: 'upgraded' },
        body: { normalized: true },
      },
    }));

    router.route(
      {
        method: 'POST',
        path: '/readonly-validated/:id',
        expose: true,
        rawRequest: true,
        schema: { input },
      },
      async (req) => {
        captured = {
          params: req.params,
          query: req.query,
          cookies: req.cookies,
          content: req.content,
          body: req.body,
          validatedInput: req.validatedInput,
        };
        return { ok: true };
      }
    );

    const request = new Request('http://localhost/readonly-validated/1?page=1', {
      method: 'POST',
      headers: {
        cookie: 'session=abc',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ original: true }),
    });

    Object.defineProperty(request, 'params', { value: { id: '1' }, writable: false, configurable: true });
    Object.defineProperty(request, 'query', { value: { page: '1' }, writable: false, configurable: true });
    Object.defineProperty(request, 'cookies', { value: { session: 'abc' }, writable: false, configurable: true });
    Object.defineProperty(request, 'content', { value: 'locked', writable: false, configurable: true });

    const res = await router.handle(request);

    expect(res.status).toBe(200);
    expect(captured.params).toEqual({ id: '1' });
    expect(captured.query).toEqual({ page: '1' });
    expect(captured.cookies).toEqual({ session: 'abc' });
    expect(captured.content).toBe('locked');
    expect(typeof captured.body?.getReader).toBe('function');
    expect(captured.validatedInput).toMatchObject({
      params: { id: '999' },
      query: { page: 2 },
      cookies: { session: 'upgraded' },
      body: { normalized: true },
    });
  });

  it('applies transformed query/cookies and keeps parsed body when validated output omits body', async () => {
    const { router } = makeRouter();
    let seenQuery: any;
    let seenCookies: any;
    let seenBody: any;

    const input = standardSchema(async (value) => {
      const payload = value as any;
      return {
        value: {
          params: payload.params,
          query: { page: Number(payload.query.page) },
          cookies: { session: String(payload.cookies.session).toUpperCase() },
        },
      };
    });

    router.route(
      {
        method: 'POST',
        path: '/transform/:id',
        expose: true,
        schema: { input },
      },
      async (req) => {
        seenQuery = req.query;
        seenCookies = req.cookies;
        seenBody = req.content;
        return { id: req.params?.id };
      }
    );

    const request = new Request('http://localhost/transform/abc?page=2', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'session=abc123',
      },
      body: JSON.stringify({ name: 'alice' }),
    });
    const res = await router.handle(request);

    expect(res.status).toBe(200);
    expect(seenQuery).toEqual({ page: 2 });
    expect(seenCookies).toEqual({ session: 'ABC123' });
    expect(seenBody).toEqual({ name: 'alice' });
  });

  it('keeps existing request fields when validator returns non-object output', async () => {
    const { router } = makeRouter();
    let captured: any;

    const input = standardSchema(async () => ({ value: 'opaque-token' }));

    router.route(
      {
        method: 'POST',
        path: '/non-object/:id',
        expose: true,
        schema: { input },
      },
      async (req) => {
        captured = {
          validatedInput: req.validatedInput,
          params: req.params,
          body: req.content,
        };
        return { ok: true };
      }
    );

    const res = await router.handle(jsonRequest('http://localhost/non-object/42', 'POST', { a: 1 }));
    expect(res.status).toBe(200);
    expect(captured.validatedInput).toBe('opaque-token');
    expect(captured.params).toEqual({ id: '42' });
    expect(captured.body).toEqual({ a: 1 });
  });

  it('validates GET requests with schema input and keeps body undefined', async () => {
    const { router } = makeRouter();
    let payloadSeenByValidator: any;

    const input = standardSchema(async (value) => {
      payloadSeenByValidator = value;
      return { value };
    });

    router.route(
      {
        method: 'GET',
        path: '/schema-get/:id',
        expose: true,
        schema: { input },
      },
      async () => ({ ok: true })
    );

    const res = await router.handle(new Request('http://localhost/schema-get/99?page=1'));
    expect(res.status).toBe(200);
    expect(payloadSeenByValidator.params).toEqual({ id: '99' });
    expect(payloadSeenByValidator.query).toEqual({ page: '1' });
    expect(payloadSeenByValidator.body).toBeUndefined();
  });
});

describe('Router — authentication integration', () => {
  it('calls authenticate on auth:true routes', async () => {
    const { router, auth } = makeRouter();
    auth.setProtectedHandler(async () => ({ id: '1' }));

    let authUserOnRequest: any;
    router.route({ method: 'GET', path: '/protected', expose: true, auth: true }, async (req) => {
      authUserOnRequest = req.authUser;
      return { secret: true };
    });

    const res = await router.handle(new Request('http://localhost/protected'));
    expect(res.status).toBe(200);
    expect(authUserOnRequest).toEqual({ id: '1' });
  });

  it('returns 401 when authenticate throws', async () => {
    const { router, auth } = makeRouter();
    auth.setProtectedHandler(async () => {
      throw new Error('invalid token');
    });

    router.route({ method: 'GET', path: '/protected', expose: true, auth: true }, async () => ({
      secret: true,
    }));

    const res = await router.handle(new Request('http://localhost/protected'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when no handler configured', async () => {
    const { router } = makeRouter();

    router.route({ method: 'GET', path: '/protected', expose: true, auth: true }, async () => ({
      secret: true,
    }));

    const res = await router.handle(new Request('http://localhost/protected'));
    expect(res.status).toBe(401);
  });

  it('skips authenticate on auth:false routes', async () => {
    const { router } = makeRouter();
    // No handler set — would throw if called
    let handlerCalled = false;

    router.route({ method: 'GET', path: '/public', expose: true, auth: false }, async () => {
      handlerCalled = true;
      return { public: true };
    });

    const res = await router.handle(new Request('http://localhost/public'));
    expect(res.status).toBe(200);
    expect(handlerCalled).toBe(true);
  });
});

describe('Router — caching integration', () => {
  it('caches handler result with numeric ttl', async () => {
    const { router } = makeRouter();
    let callCount = 0;

    router.route({ method: 'GET', path: '/cached', expose: true, cache: 60 }, async () => {
      callCount++;
      return { value: callCount };
    });

    await router.handle(new Request('http://localhost/cached'));
    await router.handle(new Request('http://localhost/cached'));

    expect(callCount).toBe(1);
  });

  it('caches handler result with object ttl', async () => {
    const { router } = makeRouter();
    let callCount = 0;

    router.route({ method: 'GET', path: '/cached-obj', expose: true, cache: { ttl: 60 } }, async () => {
      callCount++;
      return { value: callCount };
    });

    await router.handle(new Request('http://localhost/cached-obj'));
    await router.handle(new Request('http://localhost/cached-obj'));

    expect(callCount).toBe(1);
  });

  it('does not cache when cache is undefined', async () => {
    const { router } = makeRouter();
    let callCount = 0;

    router.route({ method: 'GET', path: '/uncached', expose: true, cache: undefined }, async () => {
      callCount++;
      return { value: callCount };
    });

    await router.handle(new Request('http://localhost/uncached'));
    await router.handle(new Request('http://localhost/uncached'));

    expect(callCount).toBe(2);
  });
});

describe('Router — error handling', () => {
  it('returns 500 when handler throws an Error', async () => {
    const { router } = makeRouter();

    router.route({ method: 'GET', path: '/boom', expose: true }, async () => {
      throw new Error('something broke');
    });

    const res = await router.handle(new Request('http://localhost/boom'));
    expect(res.status).toBe(500);

    const body = await res.json();
    expect(body.message).toContain('something broke');
  });

  it('returns the thrown Response directly', async () => {
    const { router } = makeRouter();

    router.route({ method: 'GET', path: '/early', expose: true }, async () => {
      throw new Response('early exit', { status: 418 });
    });

    const res = await router.handle(new Request('http://localhost/early'));
    expect(res.status).toBe(418);
  });

  it('returns rawResponse when option is set', async () => {
    const { router } = makeRouter();

    router.route(
      { method: 'GET', path: '/raw-response', expose: true, rawResponse: true },
      async () => new Response('custom', { status: 202 })
    );

    const res = await router.handle(new Request('http://localhost/raw-response'));
    expect(res.status).toBe(202);
    expect(await res.text()).toBe('custom');
  });
});
