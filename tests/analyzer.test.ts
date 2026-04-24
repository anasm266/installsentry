import { describe, it, expect } from 'vitest';
import { analyzeTrace } from '../src/analyzer.js';
import { buildGraph } from '../src/graph.js';
import { parseLockfile } from '../src/lockfile.js';
import type { TraceEvent } from '../src/types.js';

describe('analyzer', () => {
  it('detects secret canary reads', () => {
    const lockfile = parseLockfile('tests/fixtures/test-project');
    const graph = buildGraph('tests/fixtures/test-project', lockfile);
    const events: TraceEvent[] = [
      {
        type: 'fs.read',
        package: 'node_modules/evil-pkg',
        script: 'postinstall',
        timestamp: Date.now(),
        details: {
          path: '/home/user/.npmrc',
          size: 100,
          canaries: ['fake_canary_npm_token'],
        },
      },
    ];
    const result = analyzeTrace(events, graph);
    expect(result.secretHits.length).toBe(1);
    expect(result.secretHits[0].canary).toBe('fake_canary_npm_token');
  });

  it('detects network requests', () => {
    const lockfile = parseLockfile('tests/fixtures/test-project');
    const graph = buildGraph('tests/fixtures/test-project', lockfile);
    const events: TraceEvent[] = [
      {
        type: 'http.request',
        package: 'node_modules/evil-pkg',
        script: 'postinstall',
        timestamp: Date.now(),
        details: {
          url: 'https://evil.com/exfil',
          method: 'POST',
          host: 'evil.com',
        },
      },
    ];
    const result = analyzeTrace(events, graph);
    expect(result.networkRequests.length).toBe(1);
    expect(result.networkRequests[0].host).toBe('evil.com');
  });

  it('calculates blast radius paths', () => {
    const lockfile = parseLockfile('tests/fixtures/test-project');
    const graph = buildGraph('tests/fixtures/test-project', lockfile);
    const events: TraceEvent[] = [
      {
        type: 'http.request',
        package: 'node_modules/esbuild',
        script: 'postinstall',
        timestamp: Date.now(),
        details: {
          url: 'https://example.com',
          method: 'GET',
          host: 'example.com',
        },
      },
    ];
    const result = analyzeTrace(events, graph);
    expect(result.blastRadiusPaths.length).toBeGreaterThan(0);
    expect(result.blastRadiusPaths[0].riskScore).toBeGreaterThan(0);
  });
});
