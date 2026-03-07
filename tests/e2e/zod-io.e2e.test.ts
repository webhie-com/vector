import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import type { Server } from 'bun';
import testServer from './test-server';
import { createClient, withRetry } from './utils/http-client';

describe('E2E Zod + IO Workflows', () => {
  let server: Server | null = null;
  let client: ReturnType<typeof createClient>;
  let port = 0;

  const baseBody = {
    customerId: 'customer_001',
    note: 'rush delivery',
    items: [
      { sku: 'sku_keyboard', qty: '2', unitPriceCents: '4999' },
      { sku: 'sku_mouse', qty: 1, unitPriceCents: 1999 },
    ],
  };

  beforeAll(async () => {
    port = 3100 + Math.floor(Math.random() * 2000);
    client = createClient(`http://localhost:${port}`);

    server = await testServer.serve({
      port,
      hostname: '0.0.0.0',
      development: false,
    });

    await withRetry(
      async () => {
        const response = await client.get('/health');
        if (response.status !== 200) {
          throw new Error('Server not ready');
        }
      },
      5,
      1000
    );
  });

  afterAll(() => {
    server?.stop();
  });

  beforeEach(async () => {
    await client.post('/api/reset');
    await client.post('/api/zod/reset');
  });

  it('creates and fetches an order with transformed Zod input and simulated IO', async () => {
    const createResponse = await client.post(
      '/api/zod/orders?dryRun=false',
      {
        ...baseBody,
        customerId: '  customer_001  ',
        couponCode: ' spring20 ',
      },
      {
        headers: {
          'X-Request-Id': 'req_realistic_1001',
          cookie: 'session=session_abc123',
        },
      }
    );

    expect(createResponse.status).toBe(200);
    expect(createResponse.data).toMatchObject({
      idempotentReplay: false,
      customerId: 'customer_001',
      couponCode: 'SPRING20',
      status: 'pending',
      version: 1,
      itemCount: 2,
    });
    expect(createResponse.data.totalCents).toBeGreaterThan(createResponse.data.subtotalCents);

    const orderId = createResponse.data.orderId;
    expect(typeof orderId).toBe('number');

    const fetchResponse = await client.get(`/api/zod/orders/${orderId}?includeItems=true`, {
      headers: {
        cookie: 'session=session_abc123',
      },
    });

    expect(fetchResponse.status).toBe(200);
    expect(fetchResponse.data.orderId).toBe(orderId);
    expect(fetchResponse.data.items).toEqual([
      { sku: 'SKU_KEYBOARD', qty: 2, unitPriceCents: 4999 },
      { sku: 'SKU_MOUSE', qty: 1, unitPriceCents: 1999 },
    ]);
  });

  it('returns 422 when required cookie validation fails', async () => {
    const response = await client.post(
      '/api/zod/orders',
      { ...baseBody },
      {
        headers: {
          'x-request-id': 'req_cookie_missing_1002',
        },
      }
    );

    expect(response.status).toBe(422);
    expect(response.data).toHaveProperty('target', 'input');
    expect(response.data).toHaveProperty('issues');

    const hasCookieIssue = response.data.issues.some(
      (issue: { path?: Array<string | number> }) =>
        Array.isArray(issue.path) && issue.path[0] === 'cookies' && issue.path[1] === 'session'
    );
    expect(hasCookieIssue).toBe(true);
  });

  it('replays the same order for duplicate idempotency keys', async () => {
    const requestOptions = {
      headers: {
        'x-request-id': 'req_idempotent_1003',
        cookie: 'session=session_abc123',
      },
    };

    const first = await client.post('/api/zod/orders', { ...baseBody }, requestOptions);
    const second = await client.post('/api/zod/orders', { ...baseBody }, requestOptions);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.data.idempotentReplay).toBe(false);
    expect(second.data.idempotentReplay).toBe(true);
    expect(second.data.orderId).toBe(first.data.orderId);
  });

  it('returns quote mode for dry-run requests without persisting', async () => {
    const dryRun = await client.post(
      '/api/zod/orders?dryRun=true',
      { ...baseBody },
      {
        headers: {
          'x-request-id': 'req_dry_run_1004',
          cookie: 'session=session_abc123',
        },
      }
    );

    expect(dryRun.status).toBe(200);
    expect(dryRun.data).toMatchObject({
      dryRun: true,
      persisted: false,
      itemCount: 2,
    });
    expect(dryRun.data.orderId).toBeUndefined();
  });

  it('returns 409 business conflict when inventory is insufficient', async () => {
    const response = await client.post(
      '/api/zod/orders',
      {
        customerId: 'customer_002',
        items: [{ sku: 'sku_monitor', qty: 12, unitPriceCents: 23999 }],
      },
      {
        headers: {
          'x-request-id': 'req_inventory_1005',
          cookie: 'session=session_abc123',
        },
      }
    );

    expect(response.status).toBe(409);
    expect(response.data).toMatchObject({
      error: true,
      statusCode: 409,
      message: 'Insufficient inventory',
    });
    expect(Array.isArray(response.data.unavailable)).toBe(true);
    expect(response.data.unavailable[0]).toMatchObject({
      sku: 'SKU_MONITOR',
      requested: 12,
    });
  });

  it('handles optimistic concurrency for status updates', async () => {
    const create = await client.post(
      '/api/zod/orders',
      { ...baseBody },
      {
        headers: {
          'x-request-id': 'req_status_flow_1006',
          cookie: 'session=session_abc123',
        },
      }
    );

    expect(create.status).toBe(200);
    const orderId = create.data.orderId as number;

    const conflict = await client.request(`/api/zod/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: {
        cookie: 'session=session_abc123',
      },
      body: {
        status: 'paid',
        expectedVersion: 99,
      },
    });

    expect(conflict.status).toBe(409);
    expect(conflict.data).toMatchObject({
      error: true,
      statusCode: 409,
      message: 'Version mismatch',
      currentVersion: 1,
    });

    const updated = await client.request(`/api/zod/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: {
        cookie: 'session=session_abc123',
      },
      body: {
        status: 'paid',
        expectedVersion: 1,
      },
    });

    expect(updated.status).toBe(200);
    expect(updated.data).toMatchObject({
      orderId,
      status: 'paid',
      version: 2,
    });
  });
});
