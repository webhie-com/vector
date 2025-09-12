export function toFileUrl(path: string): string {
  return process.platform === 'win32'
    ? `file:///${path.replace(/\\/g, '/')}`
    : path;
}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/');
}