import { describe, expect, it } from 'bun:test';
import { CheckpointResolver } from '../src/checkpoint/resolver';

function makeResolver(options: { versionHeader?: string; cacheKeyOverride?: boolean } = {}) {
  return new CheckpointResolver({} as any, {} as any, options);
}

describe('CheckpointResolver cache key override', () => {
  it('returns null when override flag is disabled', () => {
    const resolver = makeResolver({ cacheKeyOverride: false });
    const request = new Request('http://localhost/health', {
      headers: { 'x-vector-checkpoint-version': '1.0.0' },
    });

    expect(resolver.getCacheKeyOverrideValue(request)).toBeNull();
  });

  it('returns default header-based override token when enabled', () => {
    const resolver = makeResolver({ cacheKeyOverride: true });
    const request = new Request('http://localhost/health', {
      headers: { 'x-vector-checkpoint-version': '1.2.3' },
    });

    expect(resolver.getCacheKeyOverrideValue(request)).toBe('x-vector-checkpoint-version:1.2.3');
  });

  it('uses configured version header when enabled', () => {
    const resolver = makeResolver({
      versionHeader: 'x-checkpoint-version',
      cacheKeyOverride: true,
    });
    const request = new Request('http://localhost/health', {
      headers: { 'x-checkpoint-version': '2.0.0' },
    });

    expect(resolver.getCacheKeyOverrideValue(request)).toBe('x-checkpoint-version:2.0.0');
  });

  it('does not resolve requested version from alias header when custom versionHeader is configured', () => {
    const resolver = makeResolver({
      versionHeader: 'x-custom-checkpoint-version',
      cacheKeyOverride: true,
    });
    const request = new Request('http://localhost/health', {
      headers: { 'x-vector-checkpoint': '9.9.9' },
    });

    expect(resolver.getRequestedVersion(request)).toBeNull();
  });

  it('returns null when a custom version header is configured but missing', () => {
    const resolver = makeResolver({
      versionHeader: 'x-custom-checkpoint-version',
      cacheKeyOverride: true,
    });
    const request = new Request('http://localhost/health', {
      headers: { 'x-vector-checkpoint': '3.0.0' },
    });

    expect(resolver.getCacheKeyOverrideValue(request)).toBeNull();
  });

  it('uses fallback alias header only when custom versionHeader is not configured', () => {
    const resolver = makeResolver({
      cacheKeyOverride: true,
    });
    const request = new Request('http://localhost/health', {
      headers: { 'x-vector-checkpoint': '3.0.0' },
    });

    expect(resolver.getCacheKeyOverrideValue(request)).toBe('x-vector-checkpoint:3.0.0');
  });

  it('returns null when no checkpoint header value is present', () => {
    const resolver = makeResolver({ cacheKeyOverride: true });
    const request = new Request('http://localhost/health');

    expect(resolver.getCacheKeyOverrideValue(request)).toBeNull();
  });
});
