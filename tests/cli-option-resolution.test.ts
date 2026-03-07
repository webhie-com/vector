import { describe, expect, it } from 'bun:test';
import { resolveHost, resolvePort, resolveRoutesDir } from '../src/cli/option-resolution';

describe('CLI option resolution', () => {
  describe('resolvePort', () => {
    it('uses CLI port when explicitly provided', () => {
      expect(resolvePort(9000, true, '3001')).toBe(3001);
    });

    it('uses config port when CLI port is not provided', () => {
      expect(resolvePort(9000, false, '3000')).toBe(9000);
    });

    it('treats null config port as missing and falls back to CLI default', () => {
      expect(resolvePort(null, false, '3000')).toBe(3000);
    });

    it('throws for invalid port values', () => {
      expect(() => resolvePort(null, true, 'abc')).toThrow('Invalid port value: abc');
      expect(() => resolvePort(70000, false, '3000')).toThrow('Invalid port value: 70000');
    });
  });

  describe('resolveHost', () => {
    it('uses CLI host when explicitly provided', () => {
      expect(resolveHost('api.local', true, '0.0.0.0')).toBe('0.0.0.0');
    });

    it('uses config host when CLI host is not provided', () => {
      expect(resolveHost('api.local', false, 'localhost')).toBe('api.local');
    });

    it('treats null config host as missing and falls back to CLI default', () => {
      expect(resolveHost(null, false, 'localhost')).toBe('localhost');
    });
  });

  describe('resolveRoutesDir', () => {
    it('uses CLI routes when explicitly provided', () => {
      expect(resolveRoutesDir('./config-routes', true, './cli-routes')).toBe('./cli-routes');
    });

    it('uses config routes when CLI routes are not provided', () => {
      expect(resolveRoutesDir('./config-routes', false, './routes')).toBe('./config-routes');
    });

    it('falls back to CLI default routes when config routes are nullish', () => {
      expect(resolveRoutesDir(null, false, './routes')).toBe('./routes');
      expect(resolveRoutesDir(undefined, false, './routes')).toBe('./routes');
    });
  });
});
