import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Lockfile, LockfilePackage } from '../types.js';
import { buildGraph } from '../graph.js';
import type { LockfileAdapter } from './types.js';

/**
 * Minimal Yarn Berry lockfile parser for dependency graph building.
 */
export function parseYarnLockfile(projectPath: string): Lockfile {
  const lockPath = resolve(projectPath, 'yarn.lock');
  const raw = readFileSync(lockPath, 'utf-8').replace(/\r\n/g, '\n');
  if (!raw.includes('__metadata')) {
    throw new Error(
      'Unsupported yarn.lock format. InstallSentry requires Yarn Berry (v2+) lockfiles with __metadata.'
    );
  }

  const packages: Record<string, LockfilePackage> = { '': { version: '0.0.0' } };
  const lines = raw.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    const headerMatch = line.match(/^"([^"]+@npm:[^"]+)":\s*$/);
    if (!headerMatch) {
      i++;
      continue;
    }

    const descriptor = headerMatch[1];
    const npmMatch = descriptor.match(/^(.+)@npm:(.+)$/);
    if (!npmMatch) {
      i++;
      continue;
    }

    const name = npmMatch[1];
    let version = npmMatch[2];
    const deps: Record<string, string> = {};
    i++;

    while (i < lines.length) {
      const body = lines[i];
      if (body.trim() === '') break;
      if (/^"[^"]+":\s*$/.test(body.trim()) || body.trim() === '__metadata:') break;

      const versionMatch = body.match(/^\s+version:\s*(.+)\s*$/);
      if (versionMatch) {
        version = versionMatch[1].replace(/^"|"$/g, '');
      }
      if (body.trim() === 'dependencies:') {
        i++;
        while (i < lines.length && /^\s{2}\S/.test(lines[i])) {
          const depMatch = lines[i].trim().match(/^"([^"]+)":\s*(.+)$/);
          if (depMatch) deps[depMatch[1]] = depMatch[2].trim();
          i++;
        }
        continue;
      }
      i++;
    }

    packages[`node_modules/${name}`] = {
      version,
      dependencies: Object.keys(deps).length ? deps : undefined,
    };
  }

  return { lockfileVersion: 3, packages };
}

export const yarnLockfileAdapter: LockfileAdapter = {
  kind: 'yarn',
  parse: parseYarnLockfile,
  buildGraph,
};
