import { z } from 'zod';
import { route } from '../../src/index';

const eventListSchema = {
  input: z.object({
    query: z.object({
      city: z.string().min(2),
      page: z.coerce.number().int().min(1).default(1),
      includeSoldOut: z.coerce.boolean().default(false),
    }),
  }),
};

export const listEvents = route(
  { method: 'GET', path: '/events', expose: true, schema: eventListSchema },
  async (req) => {
    const query = req.query;

    return {
      city: query.city,
      page: query.page,
      includeSoldOut: query.includeSoldOut,
      events: [
        {
          id: 'evt_jazz_night',
          name: 'Rooftop Jazz Night',
          venue: 'Skyline Club',
          priceCents: 4500,
          soldOut: false,
        },
        {
          id: 'evt_food_fest',
          name: 'Street Food Festival',
          venue: 'Market Square',
          priceCents: 2500,
          soldOut: false,
        },
      ],
    };
  }
);

const eventDetailsSchema = {
  input: z.object({
    params: z.object({ eventId: z.string().min(3) }),
    query: z.object({ timezone: z.string().default('America/Chicago') }),
  }),
};

export const getEventById = route(
  { method: 'GET', path: '/events/:eventId', expose: true, schema: eventDetailsSchema },
  async (req) => {
    const eventId = req.params?.eventId ?? 'evt_unknown';
    const timezone = req.query.timezone;

    return {
      id: eventId,
      name: 'Rooftop Jazz Night',
      startsAt: '2026-04-11T19:30:00Z',
      timezone,
      venue: { name: 'Skyline Club', city: 'Chicago' },
      tags: ['music', 'nightlife', 'outdoor'],
    };
  }
);

const reservationSchema = {
  input: z.object({
    body: z.object({
      eventId: z.string().min(3),
      attendeeName: z.string().min(2),
      attendeeEmail: z.email(),
      ticketCount: z.number().int().min(1).max(10),
      vip: z.boolean().default(false),
      notes: z.string().max(240).optional(),
    }),
  }),
};

export const createReservation = route(
  { method: 'POST', path: '/reservations', expose: true, schema: reservationSchema },
  async (req) => {
    const body = req.content;

    return {
      reservationId: 'rsv_' + crypto.randomUUID().slice(0, 8),
      status: 'confirmed',
      ...body,
      createdAt: new Date().toISOString(),
    };
  }
);
