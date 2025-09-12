export class VectorError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'VectorError';
  }
}

export class AuthenticationError extends VectorError {
  constructor(message = 'Authentication failed') {
    super(message, 'AUTH_ERROR', 401);
    this.name = 'AuthenticationError';
  }
}

export class ValidationError extends VectorError {
  constructor(
    message: string,
    public readonly field?: string
  ) {
    super(message, 'VALIDATION_ERROR', 400);
    this.name = 'ValidationError';
  }
}

export class RouteNotFoundError extends VectorError {
  constructor(path: string) {
    super(`Route not found: ${path}`, 'ROUTE_NOT_FOUND', 404);
    this.name = 'RouteNotFoundError';
  }
}

export class ConfigurationError extends VectorError {
  constructor(message: string) {
    super(message, 'CONFIG_ERROR');
    this.name = 'ConfigurationError';
  }
}

export class ServerError extends VectorError {
  constructor(message = 'Internal server error') {
    super(message, 'SERVER_ERROR', 500);
    this.name = 'ServerError';
  }
}

export function isVectorError(error: unknown): error is VectorError {
  return error instanceof VectorError;
}

export function handleError(error: unknown): Response {
  if (isVectorError(error)) {
    return new Response(
      JSON.stringify({
        error: error.message,
        code: error.code,
      }),
      {
        status: error.statusCode || 500,
        headers: { 'content-type': 'application/json' },
      }
    );
  }

  if (error instanceof Error) {
    return new Response(
      JSON.stringify({
        error: error.message,
        code: 'UNKNOWN_ERROR',
      }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }
    );
  }

  return new Response(
    JSON.stringify({
      error: 'An unknown error occurred',
      code: 'UNKNOWN_ERROR',
    }),
    {
      status: 500,
      headers: { 'content-type': 'application/json' },
    }
  );
}
