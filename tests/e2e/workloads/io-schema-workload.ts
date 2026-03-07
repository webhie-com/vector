export interface IOSchemaRequestPlan {
  method: 'GET' | 'POST';
  path: string;
  body?: Record<string, unknown>;
}

const BODY_TEMPLATES: ReadonlyArray<Record<string, unknown>> = [
  {
    userId: 'user_101',
    items: [
      { sku: 'sku_keyboard', qty: 1 },
      { sku: 'sku_mouse', qty: 2 },
    ],
    priority: true,
  },
  {
    userId: 'user_202',
    items: [{ sku: 'sku_monitor', qty: 1 }],
    priority: false,
  },
  {
    userId: 'user_303',
    items: [
      { sku: 'sku_laptop', qty: 1 },
      { sku: 'sku_usb_hub', qty: 3 },
      { sku: 'sku_cable', qty: 2 },
    ],
  },
  {
    userId: 'user_404',
    items: [{ sku: 'sku_webcam', qty: 1 }],
    priority: false,
  },
];

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function nextIOSchemaRequestPlan(): IOSchemaRequestPlan {
  const roll = Math.random();

  // 65% write-heavy create workload (validated body + async I/O)
  if (roll < 0.65) {
    const template = BODY_TEMPLATES[randomInt(0, BODY_TEMPLATES.length - 1)];
    return {
      method: 'POST',
      path: '/api/orders',
      body: {
        ...template,
        requestId: `req_${Date.now()}_${randomInt(1000, 9999)}`,
      },
    };
  }

  // 25% point read workload (validated params/query + async I/O)
  if (roll < 0.9) {
    const id = randomInt(1, 500);
    const includeItems = Math.random() < 0.4 ? 'true' : 'false';
    return {
      method: 'GET',
      path: `/api/orders/${id}?includeItems=${includeItems}`,
    };
  }

  // 10% list workload (validated query + async I/O)
  const page = randomInt(1, 5);
  const userFilter = Math.random() < 0.5 ? '&userId=user_101' : '';
  return {
    method: 'GET',
    path: `/api/orders?page=${page}&pageSize=20${userFilter}`,
  };
}
