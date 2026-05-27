import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Lockfile, LockfilePackage } from '../types.js';
import { parseJsonUtf8 } from '../json-utf8.js';
import { buildGraph } from '../graph.js';
import type { LockfileAdapter } from './types.js';

export function parseNpmLockfile(projectPath: string): Lockfile {
  const lockfilePath = resolve(projectPath, 'package-lock.json');
  const content = readFileSync(lockfilePath, 'utf-8');
  const parsed = parseJsonUtf8<Lockfile>(content);

  if (parsed.lockfileVersion !== 3) {
    throw new Error(
      `Unsupported package-lock.json version: ${parsed.lockfileVersion}. Only lockfile v3 is supported.`
    );
  }

  return parsed;
}

export function getPackageNameFromPath(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1];
}

export function* iterPackages(lockfile: Lockfile): Generator<[string, LockfilePackage]> {
  for (const [path, pkg] of Object.entries(lockfile.packages)) {
    if (path === '') continue;
    yield [path, pkg];
  }
}

export const npmLockfileAdapter: LockfileAdapter = {
  kind: 'npm',
  parse: parseNpmLockfile,
  buildGraph,
};
