export interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
}

export interface Response<T = any> {
  status: number;
  data: T;
  headers: Headers;
  time: number;
}

export class HttpClient {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;

  constructor(baseUrl: string, defaultHeaders: Record<string, string> = {}) {
    this.baseUrl = baseUrl;
    this.defaultHeaders = defaultHeaders;
  }

  async request<T = any>(path: string, options: RequestOptions = {}): Promise<Response<T>> {
    const startTime = Date.now();
    const url = `${this.baseUrl}${path}`;

    const init: RequestInit = {
      method: options.method || 'GET',
      headers: {
        ...this.defaultHeaders,
        ...options.headers,
      },
    };

    if (options.body) {
      if (typeof options.body === 'object') {
        init.body = JSON.stringify(options.body);
        init.headers = {
          ...init.headers,
          'Content-Type': 'application/json',
        };
      } else {
        init.body = options.body;
      }
    }

    try {
      const controller = new AbortController();
      const timeout = options.timeout || 5000;

      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const time = Date.now() - startTime;

      let data: T;
      const contentType = response.headers.get('content-type');

      if (contentType?.includes('application/json')) {
        data = await response.json();
      } else {
        data = (await response.text()) as any;
      }

      return {
        status: response.status,
        data,
        headers: response.headers,
        time,
      };
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${options.timeout}ms`);
      }
      throw error;
    }
  }

  async get<T = any>(path: string, options?: RequestOptions): Promise<Response<T>> {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  async post<T = any>(path: string, body?: any, options?: RequestOptions): Promise<Response<T>> {
    return this.request<T>(path, { ...options, method: 'POST', body });
  }

  async put<T = any>(path: string, body?: any, options?: RequestOptions): Promise<Response<T>> {
    return this.request<T>(path, { ...options, method: 'PUT', body });
  }

  async delete<T = any>(path: string, options?: RequestOptions): Promise<Response<T>> {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }

  setAuthToken(token: string): void {
    this.defaultHeaders['Authorization'] = `Bearer ${token}`;
  }

  clearAuthToken(): void {
    delete this.defaultHeaders['Authorization'];
  }
}

// Utility function to create a client
export function createClient(baseUrl = 'http://localhost:3001'): HttpClient {
  return new HttpClient(baseUrl);
}

// Concurrent request helper
export async function concurrentRequests<T = any>(
  client: HttpClient,
  requests: Array<{ path: string; options?: RequestOptions }>,
  concurrency = 10
): Promise<Response<T>[]> {
  const results: Response<T>[] = [];
  const queue = [...requests];
  const inProgress: Promise<void>[] = [];

  while (queue.length > 0 || inProgress.length > 0) {
    while (inProgress.length < concurrency && queue.length > 0) {
      const req = queue.shift()!;
      const promise = client
        .request<T>(req.path, req.options)
        .then((res) => {
          results.push(res);
        })
        .catch((err) => {
          results.push({
            status: 0,
            data: { error: err.message } as any,
            headers: new Headers(),
            time: 0,
          });
        });

      inProgress.push(promise);
    }

    if (inProgress.length > 0) {
      await Promise.race(inProgress);
      inProgress.splice(
        inProgress.findIndex((p) => p === undefined),
        1
      );
    }
  }

  return results;
}

// Retry helper
export async function withRetry<T = any>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delay = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      if (i < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delay * (i + 1)));
      }
    }
  }

  throw lastError;
}
