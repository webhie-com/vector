import { APIError } from '../../src/http';
import { getVectorInstance } from '../../src/core/vector';
import type { VectorConfig } from '../../src/types';
import { z } from 'zod';

interface OrderItem {
  sku: string;
  qty: number;
}

interface OrderRecord {
  id: number;
  userId: string;
  items: OrderItem[];
  priority: boolean;
  createdAt: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const orders = new Map<number, OrderRecord>();
let lastOrderId = 0;

function seedOrders(): void {
  if (orders.size > 0) return;

  for (let i = 0; i < 500; i++) {
    const id = ++lastOrderId;
    orders.set(id, {
      id,
      userId: `user_${(i % 5) + 1}0${(i % 9) + 1}`,
      items: [
        { sku: `sku_${(i % 12) + 1}`, qty: (i % 3) + 1 },
        { sku: `sku_${(i % 7) + 20}`, qty: 1 },
      ],
      priority: i % 4 === 0,
      createdAt: new Date(Date.now() - i * 1000).toISOString(),
    });
  }
}

const createOrderSchema = z.object({
  body: z.object({
    userId: z.string().trim().min(1),
    items: z
      .array(
        z.object({
          sku: z.string().trim().min(1),
          qty: z.coerce.number().int().min(1).max(100),
        })
      )
      .min(1),
    priority: z.coerce.boolean().optional().default(false),
    requestId: z.string().optional(),
  }),
});

const getOrderSchema = z.object({
  params: z.object({
    id: z.coerce.number().int().positive(),
  }),
  query: z
    .object({
      includeItems: z
        .union([z.boolean(), z.string(), z.number()])
        .optional()
        .transform((value) => value === true || value === 'true' || value === '1' || value === 1),
    })
    .optional()
    .default({ includeItems: false }),
});

const listOrdersSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    userId: z.string().trim().optional(),
  }),
});

async function serve(config: VectorConfig): Promise<{ stop: () => void }> {
  seedOrders();

  const vector = getVectorInstance();

  vector.addRoute({ method: 'GET', path: '/health', expose: true }, async () => ({ status: 'ok' }));

  vector.addRoute(
    {
      method: 'POST',
      path: '/api/orders',
      expose: true,
      schema: { input: createOrderSchema },
    },
    async (req) => {
      const body = req.validatedInput?.body ?? req.content;
      if (!body) {
        throw APIError.badRequest('Missing validated body');
      }

      await sleep(3 + Math.floor(Math.random() * 5));

      const id = ++lastOrderId;
      const record: OrderRecord = {
        id,
        userId: body.userId,
        items: body.items,
        priority: Boolean(body.priority),
        createdAt: new Date().toISOString(),
      };
      orders.set(id, record);

      await sleep(2 + Math.floor(Math.random() * 3));

      return {
        id: record.id,
        userId: record.userId,
        itemCount: record.items.length,
        priority: record.priority,
        createdAt: record.createdAt,
      };
    }
  );

  vector.addRoute(
    {
      method: 'GET',
      path: '/api/orders/:id',
      expose: true,
      schema: { input: getOrderSchema },
    },
    async (req) => {
      const validated = req.validatedInput;
      const id = Number(validated?.params?.id);
      const includeItems = Boolean(validated?.query?.includeItems ?? false);

      await sleep(2 + Math.floor(Math.random() * 4));

      const order = orders.get(id);
      if (!order) {
        throw APIError.notFound('Order not found');
      }

      await sleep(1 + Math.floor(Math.random() * 3));

      if (includeItems) {
        return order;
      }

      return {
        id: order.id,
        userId: order.userId,
        priority: order.priority,
        createdAt: order.createdAt,
      };
    }
  );

  vector.addRoute(
    {
      method: 'GET',
      path: '/api/orders',
      expose: true,
      schema: { input: listOrdersSchema },
    },
    async (req) => {
      const query = req.validatedInput?.query;
      if (!query || typeof query.page !== 'number' || typeof query.pageSize !== 'number') {
        throw APIError.badRequest('Missing validated query');
      }

      await sleep(2 + Math.floor(Math.random() * 4));

      const list = Array.from(orders.values()).filter((row) => !query.userId || row.userId === query.userId);
      const start = (query.page - 1) * query.pageSize;
      const pageItems = list.slice(start, start + query.pageSize);

      return {
        total: list.length,
        page: query.page,
        pageSize: query.pageSize,
        data: pageItems.map((row) => ({
          id: row.id,
          userId: row.userId,
          itemCount: row.items.length,
          priority: row.priority,
          createdAt: row.createdAt,
        })),
      };
    }
  );

  return vector.startServer({
    ...config,
    autoDiscover: false,
    reusePort: config.reusePort ?? false,
    development: false,
  });
}

const port = Number(process.env.PORT || 3006);

const server = await serve({
  port,
  hostname: '0.0.0.0',
  development: false,
});

process.stdout.write('READY\n');

process.on('SIGTERM', () => {
  server.stop();
  process.exit(0);
});
