export function resolveRoutesDir(
  configRoutesDir: string | null | undefined,
  hasRoutesOption: boolean,
  cliRoutes: string
): string {
  if (hasRoutesOption) {
    return cliRoutes;
  }

  return configRoutesDir ?? cliRoutes;
}

function parseAndValidatePort(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10);

  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
    throw new Error(`Invalid port value: ${String(value)}`);
  }

  return parsed;
}

export function resolvePort(
  configPort: string | number | null | undefined,
  hasPortOption: boolean,
  cliPort: string
): number {
  if (hasPortOption) {
    return parseAndValidatePort(cliPort);
  }

  const resolved = configPort ?? cliPort;
  return parseAndValidatePort(resolved);
}

export function resolveHost(configHost: string | null | undefined, hasHostOption: boolean, cliHost: string): string {
  const resolved = hasHostOption ? cliHost : (configHost ?? cliHost);

  if (typeof resolved !== 'string' || resolved.length === 0) {
    throw new Error(`Invalid host value: ${String(resolved)}`);
  }

  return resolved;
}
