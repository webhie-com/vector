import { APIError, route } from '../../src';
import { z } from 'zod';

interface OrderLine {
  sku: string;
  qty: number;
  unitPriceCents: number;
}

interface OrderRecord {
  id: number;
  customerId: string;
  items: OrderLine[];
  subtotalCents: number;
  totalCents: number;
  couponCode?: string;
  note?: string;
  status: 'pending' | 'paid' | 'cancelled';
  version: number;
  createdAt: string;
  updatedAt?: string;
  requestId: string;
}

const orders = new Map<number, OrderRecord>();
const idempotencyToOrder = new Map<string, number>();
const inventory = new Map<string, number>();

let nextOrderId = 1;

const BASE_INVENTORY: Record<string, number> = {
  SKU_KEYBOARD: 10,
  SKU_MOUSE: 20,
  SKU_MONITOR: 6,
  SKU_LAPTOP: 4,
  SKU_CABLE: 30,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeSubtotal(items: OrderLine[]): number {
  return items.reduce((sum, item) => sum + item.qty * item.unitPriceCents, 0);
}

function toOrderSummary(order: OrderRecord) {
  return {
    orderId: order.id,
    customerId: order.customerId,
    status: order.status,
    version: order.version,
    subtotalCents: order.subtotalCents,
    totalCents: order.totalCents,
    itemCount: order.items.length,
    couponCode: order.couponCode,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

async function getOrder(orderId: number): Promise<OrderRecord | undefined> {
  await sleep(6);
  return orders.get(orderId);
}

async function saveOrder(order: OrderRecord): Promise<void> {
  await sleep(8);
  orders.set(order.id, order);
}

async function collectInventoryShortages(
  items: OrderLine[]
): Promise<Array<{ sku: string; requested: number; available: number }>> {
  const shortages: Array<{ sku: string; requested: number; available: number }> = [];

  for (const item of items) {
    await sleep(2);
    const available = inventory.get(item.sku) ?? 0;
    if (available < item.qty) {
      shortages.push({
        sku: item.sku,
        requested: item.qty,
        available,
      });
    }
  }

  return shortages;
}

function reserveInventory(items: OrderLine[]): void {
  for (const item of items) {
    const available = inventory.get(item.sku) ?? 0;
    inventory.set(item.sku, available - item.qty);
  }
}

export function resetState(): void {
  orders.clear();
  idempotencyToOrder.clear();
  inventory.clear();
  for (const [sku, qty] of Object.entries(BASE_INVENTORY)) {
    inventory.set(sku, qty);
  }
  nextOrderId = 1;
}

resetState();

const orderItemSchema = z.object({
  sku: z
    .string()
    .trim()
    .min(3)
    .transform((value) => value.toUpperCase()),
  qty: z.coerce.number().int().min(1).max(25),
  unitPriceCents: z.coerce.number().int().positive(),
});

const queryBoolean = z.preprocess((value) => {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
  }

  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  return value;
}, z.boolean());

const createOrderInput = z.object({
  query: z
    .object({
      dryRun: queryBoolean.optional().default(false),
    })
    .optional()
    .default({ dryRun: false }),
  headers: z.object({
    'x-request-id': z.string().trim().min(8),
  }),
  cookies: z.object({
    session: z.string().trim().min(6),
  }),
  body: z.object({
    customerId: z.string().trim().min(3),
    note: z.string().trim().max(240).optional(),
    couponCode: z
      .string()
      .trim()
      .min(3)
      .max(20)
      .optional()
      .transform((value) => (value ? value.toUpperCase() : undefined)),
    items: z.array(orderItemSchema).min(1).max(20),
  }),
});

const getOrderInput = z.object({
  params: z.object({
    orderId: z.coerce.number().int().positive(),
  }),
  query: z
    .object({
      includeItems: queryBoolean.optional().default(false),
    })
    .optional()
    .default({ includeItems: false }),
  cookies: z.object({
    session: z.string().trim().min(6),
  }),
});

const updateOrderStatusInput = z.object({
  params: z.object({
    orderId: z.coerce.number().int().positive(),
  }),
  cookies: z.object({
    session: z.string().trim().min(6),
  }),
  body: z.object({
    status: z.enum(['pending', 'paid', 'cancelled']),
    expectedVersion: z.coerce.number().int().min(1),
  }),
});

export const createOrder = route(
  {
    method: 'POST',
    path: '/api/zod/orders',
    expose: true,
    schema: { input: createOrderInput },
  },
  async (req) => {
    const validated = req.validatedInput;
    const requestId = validated?.headers?.['x-request-id'];
    const body = validated?.body ?? req.content;
    const dryRun = validated?.query?.dryRun ?? req.query?.dryRun ?? false;

    if (!requestId || !body) {
      throw APIError.badRequest('Missing validated order input');
    }

    const normalizedItems: OrderLine[] = body.items.map((item) => ({
      sku: String(item.sku),
      qty: item.qty,
      unitPriceCents: item.unitPriceCents,
    }));

    const existingOrderId = idempotencyToOrder.get(requestId);
    if (existingOrderId !== undefined) {
      const existingOrder = await getOrder(existingOrderId);
      if (!existingOrder) {
        throw APIError.internalServerError('Idempotent order lookup failed');
      }

      return {
        ...toOrderSummary(existingOrder),
        idempotentReplay: true,
      };
    }

    const shortages = await collectInventoryShortages(normalizedItems);
    if (shortages.length > 0) {
      return Response.json(
        {
          error: true,
          statusCode: 409,
          message: 'Insufficient inventory',
          unavailable: shortages,
        },
        { status: 409 }
      );
    }

    const subtotalCents = computeSubtotal(normalizedItems);
    const totalCents = subtotalCents + Math.round(subtotalCents * 0.07);

    if (dryRun) {
      await sleep(4);
      return {
        dryRun: true,
        persisted: false,
        subtotalCents,
        totalCents,
        itemCount: normalizedItems.length,
      };
    }

    reserveInventory(normalizedItems);

    const now = new Date().toISOString();
    const order: OrderRecord = {
      id: nextOrderId++,
      customerId: body.customerId,
      items: normalizedItems,
      subtotalCents,
      totalCents,
      couponCode: body.couponCode,
      note: body.note,
      status: 'pending',
      version: 1,
      createdAt: now,
      requestId,
    };

    await saveOrder(order);
    idempotencyToOrder.set(requestId, order.id);

    return {
      ...toOrderSummary(order),
      idempotentReplay: false,
    };
  }
);

export const getOrderById = route(
  {
    method: 'GET',
    path: '/api/zod/orders/:orderId',
    expose: true,
    schema: { input: getOrderInput },
  },
  async (req) => {
    const validated = req.validatedInput;
    const orderIdValue = validated?.params?.orderId ?? req.params?.orderId;
    const orderId = typeof orderIdValue === 'number' ? orderIdValue : Number(orderIdValue);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      throw APIError.badRequest('Missing order id');
    }

    const includeItems = validated?.query?.includeItems ?? req.query?.includeItems ?? false;
    const order = await getOrder(orderId);

    if (!order) {
      throw APIError.notFound('Order not found');
    }

    if (includeItems) {
      return {
        ...toOrderSummary(order),
        items: order.items,
      };
    }

    return toOrderSummary(order);
  }
);

export const updateOrderStatus = route(
  {
    method: 'PATCH',
    path: '/api/zod/orders/:orderId/status',
    expose: true,
    schema: { input: updateOrderStatusInput },
  },
  async (req) => {
    const validated = req.validatedInput;
    const orderIdValue = validated?.params?.orderId ?? req.params?.orderId;
    const orderId = typeof orderIdValue === 'number' ? orderIdValue : Number(orderIdValue);
    const body = validated?.body ?? req.content;

    if (!Number.isInteger(orderId) || orderId <= 0 || !body) {
      throw APIError.badRequest('Missing validated status input');
    }

    const order = await getOrder(orderId);
    if (!order) {
      throw APIError.notFound('Order not found');
    }

    if (body.expectedVersion !== order.version) {
      return Response.json(
        {
          error: true,
          statusCode: 409,
          message: 'Version mismatch',
          expectedVersion: body.expectedVersion,
          currentVersion: order.version,
        },
        { status: 409 }
      );
    }

    await sleep(5);
    order.status = body.status;
    order.version += 1;
    order.updatedAt = new Date().toISOString();
    await saveOrder(order);

    return toOrderSummary(order);
  }
);

export const resetZodData = route(
  {
    method: 'POST',
    path: '/api/zod/reset',
    expose: true,
  },
  async () => {
    resetState();
    return { ok: true };
  }
);
