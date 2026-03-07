import { z } from 'zod';
import { route } from '../../src/index';

const checkoutValidationError = z.object({
  error: z.literal(true),
  message: z.string(),
  statusCode: z.literal(422),
  source: z.literal('validation'),
  target: z.literal('input'),
  issues: z.array(
    z.object({
      message: z.string(),
      path: z.array(z.union([z.string(), z.number()])),
      code: z.string().optional(),
    })
  ),
  timestamp: z.string(),
});

const checkoutOutput = z.object({
  checkoutId: z.string(),
  paymentIntentId: z.string(),
  currency: z.literal('usd'),
  subtotalCents: z.number().int(),
  serviceFeeCents: z.number().int(),
  totalCents: z.number().int(),
  customer: z.object({ email: z.email(), marketingOptIn: z.boolean() }),
  createdAt: z.string(),
});

const inventoryConflict = z.object({
  error: z.literal(true),
  statusCode: z.literal(409),
  message: z.string(),
  unavailableSeatIds: z.array(z.string()),
  retryable: z.boolean(),
});

const checkoutSchema = {
  input: z.object({
    params: z.object({ tenantId: z.string().min(2) }),
    query: z.object({ dryRun: z.coerce.boolean().default(false) }),
    body: z.object({
      eventId: z.string().min(3),
      promoCode: z.string().min(3).optional(),
      customer: z.object({ email: z.email(), marketingOptIn: z.boolean().default(false) }),
      items: z
        .array(
          z.object({
            seatId: z.string(),
            tier: z.enum(['standard', 'premium', 'vip']),
            quantity: z.number().int().min(1).max(8),
            unitPriceCents: z.number().int().positive(),
          })
        )
        .min(1),
      metadata: z.object({ source: z.enum(['web', 'ios', 'android']), campaign: z.string().optional() }).optional(),
    }),
  }),
  output: { 201: checkoutOutput, 409: inventoryConflict, 422: checkoutValidationError },
};

export const createFestivalCheckoutSession = route(
  { method: 'POST', path: '/commerce/checkout/:tenantId', auth: true, schema: checkoutSchema },
  async (req) => {
    if (!req.content) {
      return { error: true, message: 'Missing checkout payload' };
    }

    const body = req.content;

    const subtotalCents = body.items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);
    const serviceFeeCents = Math.round(subtotalCents * 0.08);
    const totalCents = subtotalCents + serviceFeeCents;

    return {
      checkoutId: 'chk_' + crypto.randomUUID().slice(0, 12),
      paymentIntentId: 'pi_' + crypto.randomUUID().slice(0, 12),
      currency: 'usd',
      subtotalCents,
      serviceFeeCents,
      totalCents,
      customer: body.customer,
      createdAt: new Date().toISOString(),
    };
  }
);
