const WATCHED_SUFFIXES = ['.ts', '.js', '.json'];
const IGNORED_SUFFIXES = ['.generated.ts'];
const IGNORED_SUBSTRINGS = ['bun.lockb'];
const EXCLUDED_SEGMENTS = new Set(['node_modules', '.git', '.vector', 'dist']);

export const UNKNOWN_FILENAME_EVENT_COOLDOWN_MS = 1500;

export interface UnknownChangeDecisionInput {
  eventType: string;
  pendingUnknownChange: boolean;
  now: number;
  cooldownUntil: number;
  cooldownMs: number;
}

export interface UnknownChangeDecision {
  shouldSchedule: boolean;
  nextPendingUnknownChange: boolean;
  nextCooldownUntil: number;
}

export function shouldTrackKnownFilenameChange(filename: string): boolean {
  if (!WATCHED_SUFFIXES.some((suffix) => filename.endsWith(suffix))) {
    return false;
  }

  if (IGNORED_SUFFIXES.some((suffix) => filename.endsWith(suffix))) {
    return false;
  }

  if (IGNORED_SUBSTRINGS.some((value) => filename.includes(value))) {
    return false;
  }

  const segments = filename.split(/[/\\]/);
  if (segments.some((segment) => EXCLUDED_SEGMENTS.has(segment))) {
    return false;
  }

  return true;
}

export function decideUnknownChangeReload(input: UnknownChangeDecisionInput): UnknownChangeDecision {
  const isRelevantUnknownEvent = input.eventType === 'rename' || input.eventType === 'change';

  if (!isRelevantUnknownEvent) {
    return {
      shouldSchedule: false,
      nextPendingUnknownChange: input.pendingUnknownChange,
      nextCooldownUntil: input.cooldownUntil,
    };
  }

  if (input.pendingUnknownChange || input.now < input.cooldownUntil) {
    return {
      shouldSchedule: false,
      nextPendingUnknownChange: input.pendingUnknownChange,
      nextCooldownUntil: input.cooldownUntil,
    };
  }

  return {
    shouldSchedule: true,
    nextPendingUnknownChange: true,
    nextCooldownUntil: input.now + input.cooldownMs,
  };
}
