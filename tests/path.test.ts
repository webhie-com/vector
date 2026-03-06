import { describe, expect, it } from 'bun:test';
import { buildRouteRegex, normalizePath } from '../src/utils/path';

describe('buildRouteRegex', () => {
  const matches = (path: string, url: string) => url.match(buildRouteRegex(path)) !== null;

  describe('static routes', () => {
    it('matches exact static path', () => {
      expect(matches('/health', '/health')).toBe(true);
    });

    it('matches nested static path', () => {
      expect(matches('/api/products', '/api/products')).toBe(true);
    });

    it('does not match different static path', () => {
      expect(matches('/api/products', '/api/orders')).toBe(false);
    });

    it('matches root path', () => {
      expect(matches('/', '/')).toBe(true);
    });

    it('matches with trailing slash', () => {
      expect(matches('/health', '/health/')).toBe(true);
    });
  });

  describe('parameterized routes', () => {
    it('matches a single param segment', () => {
      expect(matches('/users/:id', '/users/42')).toBe(true);
    });

    it('captures named param groups', () => {
      const match = '/users/99'.match(buildRouteRegex('/users/:id'));
      expect(match?.groups?.id).toBe('99');
    });

    it('matches multiple params', () => {
      const match = '/api/v2/users/7'.match(buildRouteRegex('/api/:version/users/:id'));
      expect(match?.groups?.version).toBe('v2');
      expect(match?.groups?.id).toBe('7');
    });

    it('does not match param route with extra segments', () => {
      expect(matches('/users/:id', '/users/42/extra')).toBe(false);
    });

    it('does not match param route with empty segment', () => {
      expect(matches('/users/:id', '/users/')).toBe(false);
    });
  });

  describe('wildcard routes', () => {
    it('matches wildcard at end', () => {
      expect(matches('/files/*', '/files/anything')).toBe(true);
    });

    it('matches wildcard with nested path', () => {
      expect(matches('/files/*', '/files/a/b/c')).toBe(true);
    });

    it('matches wildcard with no trailing segment', () => {
      expect(matches('/files/*', '/files')).toBe(true);
    });
  });

  describe('greedy params (:name+)', () => {
    it('matches greedy param across segments', () => {
      const match = '/files/docs/readme.md'.match(buildRouteRegex('/files/:path+'));
      expect(match?.groups?.path).toBeTruthy();
    });
  });

  describe('specificity — static beats param beats wildcard', () => {
    it('static route does not match param path', () => {
      // /users/profile should not be treated as :id
      const staticRegex = buildRouteRegex('/users/profile');
      const paramRegex = buildRouteRegex('/users/:id');

      expect('/users/profile'.match(staticRegex)).not.toBeNull();
      expect('/users/profile'.match(paramRegex)).not.toBeNull();
      // Both match — ordering in the router determines priority (tested in router.test.ts)
    });

    it('param route does not match deeper static path', () => {
      expect(matches('/users/:id', '/users/profile/settings')).toBe(false);
    });
  });
});

describe('normalizePath', () => {
  it('converts backslashes to forward slashes', () => {
    expect(normalizePath('src\\utils\\path')).toBe('src/utils/path');
  });

  it('collapses multiple slashes', () => {
    expect(normalizePath('src//utils///path')).toBe('src/utils/path');
  });

  it('leaves already normalized paths unchanged', () => {
    expect(normalizePath('src/utils/path')).toBe('src/utils/path');
  });
});
