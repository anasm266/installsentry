import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Lockfile, LockfilePackage } from './types.js';

export function parseLockfile(projectPath: string): Lockfile {
  const lockfilePath = resolve(projectPath, 'package-lock.json');
  const content = readFileSync(lockfilePath, 'utf-8');
  const parsed = JSON.parse(content) as Lockfile;

  if (parsed.lockfileVersion !== 3) {
    throw new Error(
      `Unsupported lockfile version: ${parsed.lockfileVersion}. Only v3 is supported.`
    );
  }

  return parsed;
}

export function getPackageNameFromPath(path: string): string {
  // "node_modules/foo" -> "foo"
  // "node_modules/foo/node_modules/bar" -> "bar"
  const parts = path.split('/');
  return parts[parts.length - 1];
}

export function* iterPackages(lockfile: Lockfile): Generator<[string, LockfilePackage]> {
  for (const [path, pkg] of Object.entries(lockfile.packages)) {
    if (path === '') continue; // root package
    yield [path, pkg];
  }
}
