import { describe, it, expect } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePnpmLockfile } from '../src/lockfile/pnpm.js';
import { parseYarnLockfile } from '../src/lockfile/yarn.js';
import { buildGraph } from '../src/graph.js';
import { detectPackageManager } from '../src/package-manager.js';

const root = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const pnpmPath = join(root, 'pnpm-minimal');
const yarnPath = join(root, 'yarn-minimal');

describe('pnpm lockfile', () => {
  it('parses pnpm-lock.yaml into unified packages', () => {
    const lock = parsePnpmLockfile(pnpmPath);
    expect(lock.packages['node_modules/ms']).toBeDefined();
    expect(lock.packages['node_modules/ms'].version).toBe('2.1.3');
  });

  it('builds a dependency graph', () => {
    const lock = parsePnpmLockfile(pnpmPath);
    const graph = buildGraph(pnpmPath, lock);
    expect(graph.nodes.get('node_modules/ms')).toBeDefined();
  });

  it('auto-detects pnpm', () => {
    const d = detectPackageManager(pnpmPath);
    expect(d.kind).toBe('pnpm');
  });
});

describe('yarn lockfile', () => {
  it('parses Berry yarn.lock', () => {
    const lock = parseYarnLockfile(yarnPath);
    expect(lock.packages['node_modules/ms']).toBeDefined();
  });

  it('auto-detects yarn', () => {
    const d = detectPackageManager(yarnPath);
    expect(d.kind).toBe('yarn');
  });
});
