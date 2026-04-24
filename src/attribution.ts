/** Cwd is the sandbox install root (npm itself), not a lockfile node */
export const ATTR_INSTALL_ROOT = 'install-root';

const NON_GRAPH_IDS = new Set([ATTR_INSTALL_ROOT, 'unknown', 'root']);

export function isNonGraphPackageId(id: string): boolean {
  return NON_GRAPH_IDS.has(id);
}

export function displayPackageIdForReport(id: string | undefined): string {
  if (!id || id === 'root') return 'Project install (npm)';
  if (id === ATTR_INSTALL_ROOT) return 'Project install (npm)';
  if (id === 'unknown') return 'Unknown';
  return id;
}
