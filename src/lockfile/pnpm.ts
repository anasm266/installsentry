import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { stripBom } from '../json-utf8.js';
import type { Lockfile, LockfilePackage } from '../types.js';
import { buildGraph } from '../graph.js';
import type { LockfileAdapter } from './types.js';

function parsePnpmPackageKey(key: string): { name: string; version: string } {
  const at = key.lastIndexOf('@');
  if (at <= 0) return { name: key, version: '0.0.0' };
  return { name: key.slice(0, at), version: key.slice(at + 1) };
}

/**
 * Parse pnpm-lock.yaml into the unified Lockfile shape (node_modules paths).
 */
export function parsePnpmLockfile(projectPath: string): Lockfile {
  const lockPath = resolve(projectPath, 'pnpm-lock.yaml');
  const doc = parseYaml(stripBom(readFileSync(lockPath, 'utf-8'))) as {
    lockfileVersion?: string | number;
    packages?: Record<string, Record<string, unknown>>;
    importers?: Record<string, { dependencies?: Record<string, string> }>;
  };

  const packages: Record<string, LockfilePackage> = { '': { version: '0.0.0' } };
  const pkgSection = doc.packages || {};

  for (const [key, meta] of Object.entries(pkgSection)) {
    const { name, version } = parsePnpmPackageKey(key);
    const path = `node_modules/${name}`;
    const deps = meta.dependencies as Record<string, string> | undefined;
    packages[path] = {
      version: (meta.version as string) || version,
      dependencies: deps,
    };
  }

  const rootDeps = doc.importers?.['.']?.dependencies;
  if (rootDeps) {
    for (const depName of Object.keys(rootDeps)) {
      const path = `node_modules/${depName}`;
      if (!packages[path]) {
        packages[path] = { version: rootDeps[depName].replace(/^[\^~]/, '') || '0.0.0' };
      }
    }
  }

  return {
    lockfileVersion: 3,
    packages,
  };
}

export const pnpmLockfileAdapter: LockfileAdapter = {
  kind: 'pnpm',
  parse: parsePnpmLockfile,
  buildGraph,
};
