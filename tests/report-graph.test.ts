import { describe, it, expect } from 'vitest';
import { buildGraph } from '../src/graph.js';
import { parseLockfile } from '../src/lockfile.js';
import { computeBlastFocusNodeIds, computeResolvedHighlightIds } from '../src/report-graph.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const malwareFixture = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'malware-demo');

describe('report-graph', () => {
  it('collects blast focus node ids from real paths', () => {
    const lock = parseLockfile(malwareFixture);
    const graph = buildGraph(malwareFixture, lock);
    const analysis = {
      events: [],
      secretHits: [],
      networkRequests: [],
      fileChanges: [],
      lifecycleExecutions: [],
      blastRadiusPaths: [
        {
          target: 'packages/malice-local',
          path: ['packages/malice-local'],
          riskScore: 10,
        },
      ],
    };
    const ids = computeBlastFocusNodeIds(graph, analysis);
    expect(ids).toContain('packages/malice-local');
  });

  it('resolves highlight packages to graph ids', () => {
    const lock = parseLockfile(malwareFixture);
    const graph = buildGraph(malwareFixture, lock);
    const analysis = {
      events: [],
      secretHits: [
        { canary: 'x', package: 'packages/malice-local', filePath: '/a', timestamp: 0 },
      ],
      networkRequests: [],
      fileChanges: [],
      lifecycleExecutions: [],
      blastRadiusPaths: [],
    };
    const hi = computeResolvedHighlightIds(graph, analysis);
    expect(hi).toContain('packages/malice-local');
  });
});
