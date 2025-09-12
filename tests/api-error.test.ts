import { describe, expect, it } from 'bun:test';
import { APIError, createResponse } from '../src/http';

describe('APIError', () => {
  describe('Error Response Creation', () => {
    it('should create 400 Bad Request', () => {
      const response = APIError.badRequest('Invalid input');
      expect(response.status).toBe(400);
    });

    it('should create 401 Unauthorized', () => {
      const response = APIError.unauthorized();
      expect(response.status).toBe(401);
    });

    it('should create 403 Forbidden', () => {
      const response = APIError.forbidden('Access denied');
      expect(response.status).toBe(403);
    });

    it('should create 404 Not Found', () => {
      const response = APIError.notFound('Resource not found');
      expect(response.status).toBe(404);
    });

    it('should create 409 Conflict', () => {
      const response = APIError.conflict('Resource already exists');
      expect(response.status).toBe(409);
    });

    it('should create 422 Unprocessable Entity', () => {
      const response = APIError.unprocessableEntity('Validation failed');
      expect(response.status).toBe(422);
    });

    it('should create 429 Too Many Requests', () => {
      const response = APIError.tooManyRequests('Rate limit exceeded');
      expect(response.status).toBe(429);
    });

    it('should create 500 Internal Server Error', () => {
      const response = APIError.internalServerError('Something went wrong');
      expect(response.status).toBe(500);
    });

    it('should create 503 Service Unavailable', () => {
      const response = APIError.serviceUnavailable('Service is down');
      expect(response.status).toBe(503);
    });
  });

  describe('Error Response Format', () => {
    it('should include error details in response body', async () => {
      const response = APIError.badRequest('Test error message');
      const body = await response.json();

      expect(body.error).toBe(true);
      expect(body.message).toBe('Test error message');
      expect(body.statusCode).toBe(400);
      expect(body.timestamp).toBeDefined();
    });

    it('should use default messages when not provided', async () => {
      const response = APIError.unauthorized();
      const body = await response.json();

      expect(body.message).toBe('Unauthorized');
    });

    it('should support custom content types', () => {
      const response = APIError.badRequest('Error', 'text/plain');
      expect(response.headers.get('content-type')).toBe('text/plain');
    });
  });

  describe('Custom Error Creation', () => {
    it('should create custom status code errors', () => {
      const response = APIError.custom(418, "I'm a teapot");
      expect(response.status).toBe(418);
    });

    it('should handle rate limit errors', () => {
      const response = APIError.rateLimitExceeded('Too many requests from this IP');
      expect(response.status).toBe(429);
    });

    it('should handle maintenance errors', () => {
      const response = APIError.maintenance('System under maintenance');
      expect(response.status).toBe(503);
    });
  });
});

describe('createResponse', () => {
  it('should create JSON responses by default', async () => {
    const response = createResponse(200, { success: true });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json');

    const body = await response.json();
    expect(body.success).toBe(true);
  });

  it('should handle different content types', () => {
    const response = createResponse(200, 'Hello World', 'text/plain');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/plain');
  });

  it('should handle null data', async () => {
    const response = createResponse(204, null);
    const text = await response.text();
    expect(text).toBe('null');
  });

  it('should handle BigInt serialization', async () => {
    const data = { id: BigInt(123456789012345678901234567890n) };
    const response = createResponse(200, data);
    const body = await response.json();

    expect(body.id).toBe('123456789012345678901234567890');
  });
});
