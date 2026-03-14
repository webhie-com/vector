import { describe, expect, it } from 'bun:test';
import {
  decideUnknownChangeReload,
  shouldTrackKnownFilenameChange,
  UNKNOWN_FILENAME_EVENT_COOLDOWN_MS,
} from '../src/cli/watch-reload-policy';

describe('CLI watch reload policy', () => {
  describe('shouldTrackKnownFilenameChange', () => {
    it('tracks relevant source file extensions', () => {
      expect(shouldTrackKnownFilenameChange('routes/health.ts')).toBe(true);
      expect(shouldTrackKnownFilenameChange('routes/health.js')).toBe(true);
      expect(shouldTrackKnownFilenameChange('routes/config.json')).toBe(true);
    });

    it('ignores excluded and generated paths', () => {
      expect(shouldTrackKnownFilenameChange('node_modules/pkg/index.ts')).toBe(false);
      expect(shouldTrackKnownFilenameChange('.git/hooks/pre-commit.js')).toBe(false);
      expect(shouldTrackKnownFilenameChange('dist/output.ts')).toBe(false);
      expect(shouldTrackKnownFilenameChange('routes/internal.generated.ts')).toBe(false);
      expect(shouldTrackKnownFilenameChange('routes/bun.lockb')).toBe(false);
      expect(shouldTrackKnownFilenameChange('routes/readme.md')).toBe(false);
    });
  });

  describe('decideUnknownChangeReload', () => {
    it('schedules once for relevant unknown events', () => {
      const decision = decideUnknownChangeReload({
        eventType: 'rename',
        pendingUnknownChange: false,
        now: 1000,
        cooldownUntil: 0,
        cooldownMs: UNKNOWN_FILENAME_EVENT_COOLDOWN_MS,
      });

      expect(decision.shouldSchedule).toBe(true);
      expect(decision.nextPendingUnknownChange).toBe(true);
      expect(decision.nextCooldownUntil).toBe(1000 + UNKNOWN_FILENAME_EVENT_COOLDOWN_MS);
    });

    it('does not schedule for irrelevant unknown events', () => {
      const decision = decideUnknownChangeReload({
        eventType: 'close',
        pendingUnknownChange: false,
        now: 1000,
        cooldownUntil: 0,
        cooldownMs: UNKNOWN_FILENAME_EVENT_COOLDOWN_MS,
      });

      expect(decision.shouldSchedule).toBe(false);
      expect(decision.nextPendingUnknownChange).toBe(false);
      expect(decision.nextCooldownUntil).toBe(0);
    });

    it('does not reschedule when unknown reload is already pending', () => {
      const decision = decideUnknownChangeReload({
        eventType: 'change',
        pendingUnknownChange: true,
        now: 1000,
        cooldownUntil: 0,
        cooldownMs: UNKNOWN_FILENAME_EVENT_COOLDOWN_MS,
      });

      expect(decision.shouldSchedule).toBe(false);
      expect(decision.nextPendingUnknownChange).toBe(true);
      expect(decision.nextCooldownUntil).toBe(0);
    });

    it('does not reschedule inside cooldown window', () => {
      const decision = decideUnknownChangeReload({
        eventType: 'rename',
        pendingUnknownChange: false,
        now: 1200,
        cooldownUntil: 2000,
        cooldownMs: UNKNOWN_FILENAME_EVENT_COOLDOWN_MS,
      });

      expect(decision.shouldSchedule).toBe(false);
      expect(decision.nextPendingUnknownChange).toBe(false);
      expect(decision.nextCooldownUntil).toBe(2000);
    });
  });
});
