export function toFileUrl(path: string): string {
  return process.platform === 'win32' ? `file:///${path.replace(/\\/g, '/')}` : path;
}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/');
}

export function buildRouteRegex(path: string): RegExp {
  return RegExp(
    `^${path
      .replace(/\/+(\/|$)/g, '$1')
      .replace(/(\/?\.?):(\w+)\+/g, '($1(?<$2>*))')
      .replace(/(\/?\.?):(\w+)/g, '($1(?<$2>[^$1/]+?))')
      .replace(/\./g, '\\.')
      .replace(/(\/?)\*/g, '($1.*)?')}/*$`
  );
}
