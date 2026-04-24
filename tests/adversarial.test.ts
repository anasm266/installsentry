import { describe, it, expect } from 'vitest';
import { parseLockfile } from '../src/lockfile.js';
import { buildGraph } from '../src/graph.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const chdirRoot = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'adversarial', 'chdir-demo');

describe('adversarial chdir fixture', () => {
  it('resolves a graph for the chdir demo tree', () => {
    const lock = parseLockfile(chdirRoot);
    const g = buildGraph(chdirRoot, lock);
    expect(g.nodes.get('packages/chdir-pkg')).toBeDefined();
  });
});
