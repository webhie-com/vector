/**
 * Decides which Vector routes can be handed to Bun.serve's native router.
 *
 * Bun matches native routes in its own radix tree, so those requests skip JavaScript routing.
 * Anything Bun does not match natively (a missing method, a trailing slash, an unmatched path)
 * falls through to the server's `fetch` handler, which runs Vector's JS router over the full route
 * table. A route is registered natively only when that split cannot change which route serves a
 * request:
 *
 * - its path uses syntax Bun matches the same way (plain segments and whole-segment `:params`);
 * - Bun's priority (a static segment beats a param, segment by segment) picks the same route as
 *   Vector's specificity order for every URL it matches. That fails for overlapping patterns where
 *   neither is more specific in every segment (`/a/:x/c` vs `/a/b/:y`, or shapes that differ only
 *   in param names);
 * - no JS-only route (wildcards, `:param+`, `:name.json`, ...) could outrank it for some URL.
 *
 * Routes that fail a rule stay on the JS router together with every route that overlaps them, so a
 * native route can never shadow a route the JS router would have picked.
 */

const PARAM_SEGMENT = /^:[A-Za-z_][A-Za-z0-9_]*$/;
// RFC 3986 pchar without ':' (reserved for params) and '%' (Bun matches decoded paths).
const STATIC_SEGMENT = /^[A-Za-z0-9._~!$&'()+,;=@-]+$/;

/** Vector's route priority: higher wins; ties are broken by `path.localeCompare`. */
export function routeSpecificityScore(path: string): number {
  const STATIC_SEGMENT_WEIGHT = 1000;
  const PARAM_SEGMENT_WEIGHT = 10;
  const WILDCARD_WEIGHT = 1;
  const EXACT_MATCH_BONUS = 10000;

  const segments = path.split('/').filter(Boolean);
  let score = 0;

  for (const segment of segments) {
    if (segment.includes('*')) {
      score += WILDCARD_WEIGHT;
    } else if (segment.startsWith(':')) {
      score += PARAM_SEGMENT_WEIGHT;
    } else {
      score += STATIC_SEGMENT_WEIGHT;
    }
  }

  score += path.length;
  if (!path.includes(':') && !path.includes('*')) {
    score += EXACT_MATCH_BONUS;
  }

  return score;
}

/** True when Bun's native router matches `path` exactly the way Vector's regex matcher does. */
export function isNativeCompatiblePath(path: string): boolean {
  if (path === '/') {
    return true;
  }
  // Trailing-slash patterns and anything not rooted at '/' stay on the JS router.
  if (!path.startsWith('/') || path.endsWith('/')) {
    return false;
  }

  const paramNames = new Set<string>();
  for (const segment of path.slice(1).split('/')) {
    if (PARAM_SEGMENT.test(segment)) {
      if (paramNames.has(segment)) {
        return false;
      }
      paramNames.add(segment);
      continue;
    }
    if (!STATIC_SEGMENT.test(segment)) {
      return false;
    }
  }
  return true;
}

interface Segment {
  param: boolean;
  value: string;
}

function toSegments(path: string): Segment[] {
  const trimmed = path.startsWith('/') ? path.slice(1) : path;
  if (trimmed.length === 0) {
    return [];
  }
  return trimmed.split('/').map((value) => ({ param: value.startsWith(':'), value }));
}

/** Whether some URL path matches both native-compatible patterns. */
function overlaps(a: Segment[], b: Segment[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (!x.param && !y.param && x.value !== y.value) {
      return false;
    }
  }
  return true;
}

/** `a` is at least as specific as `b` in every segment and strictly more specific in one. */
function dominates(a: Segment[], b: Segment[]): boolean {
  let strictlyMoreSpecific = false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (x.param && !y.param) {
      return false;
    }
    if (!x.param && y.param) {
      strictlyMoreSpecific = true;
    }
  }
  return strictlyMoreSpecific;
}

/**
 * Conservative check for whether a JS-only pattern could match some URL that `native` matches.
 * Only the leading plain segments of the JS-only pattern are compared; everything after its first
 * non-plain segment is assumed to match anything.
 */
function mayOverlapJsOnly(jsOnly: Segment[], native: Segment[]): boolean {
  for (let i = 0; i < jsOnly.length && i < native.length; i++) {
    const segment = jsOnly[i]!;
    const nativeSegment = native[i]!;
    const plain = PARAM_SEGMENT.test(segment.value) || STATIC_SEGMENT.test(segment.value);
    if (!plain) {
      return true;
    }
    if (!segment.param && !nativeSegment.param && segment.value !== nativeSegment.value) {
      return false;
    }
  }
  return true;
}

/** The subset of `paths` that is safe to register with Bun.serve's native router. */
export function selectNativePaths(paths: readonly string[]): Set<string> {
  const native = paths.filter(isNativeCompatiblePath);
  const jsOnly = paths.filter((path) => !isNativeCompatiblePath(path));
  const segments = native.map(toSegments);
  const scores = native.map(routeSpecificityScore);

  const parent = native.map((_, index) => index);
  const find = (index: number): number => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]!]!;
      index = parent[index]!;
    }
    return index;
  };

  const seeds: number[] = [];
  for (let i = 0; i < native.length; i++) {
    for (let j = i + 1; j < native.length; j++) {
      if (!overlaps(segments[i]!, segments[j]!)) {
        continue;
      }
      parent[find(i)] = find(j);
      if (!dominates(segments[i]!, segments[j]!) && !dominates(segments[j]!, segments[i]!)) {
        seeds.push(i);
      }
    }
  }

  for (const path of jsOnly) {
    const jsSegments = toSegments(path);
    const jsScore = routeSpecificityScore(path);
    for (let i = 0; i < native.length; i++) {
      // A JS-only route that ranks below a native route can never take a URL from it.
      if (jsScore < scores[i]!) {
        continue;
      }
      if (mayOverlapJsOnly(jsSegments, segments[i]!)) {
        seeds.push(i);
      }
    }
  }

  const excludedRoots = new Set(seeds.map(find));
  const selected = new Set<string>();
  for (let i = 0; i < native.length; i++) {
    if (!excludedRoots.has(find(i))) {
      selected.add(native[i]!);
    }
  }
  return selected;
}
