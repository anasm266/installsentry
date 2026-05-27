import { describe, expect, it } from 'vitest';
import { buildFindings, countFindingsBySeverity } from '../src/findings.js';
import type { AnalysisResult, DependencyGraph } from '../src/types.js';

function emptyAnalysis(): AnalysisResult {
  return {
    events: [],
    secretHits: [],
    networkRequests: [],
    fileChanges: [],
    lifecycleExecutions: [],
    blastRadiusPaths: [],
  };
}

function emptyGraph(): DependencyGraph {
  return { nodes: new Map(), edges: [] };
}

describe('findings', () => {
  it('turns secret exfiltration and network requests into severity-sorted findings', () => {
    const analysis = emptyAnalysis();
    analysis.networkRequests = [
      {
        package: 'install-root',
        host: 'registry.npmjs.org',
        method: 'POST',
        url: 'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk',
        timestamp: 1,
      },
      {
        package: 'packages/malice-local',
        host: 'example.com',
        method: 'GET',
        url: 'https://example.com/?exfil=fake_canary_aws_secret',
        timestamp: 2,
      },
    ];
    analysis.secretHits = [
      {
        canary: 'fake_canary_aws_secret',
        package: 'packages/malice-local',
        filePath: 'https://example.com/?exfil=fake_canary_aws_secret',
        timestamp: 2,
      },
    ];

    const findings = buildFindings(analysis, emptyGraph());

    expect(findings[0]?.severity).toBe('CRITICAL');
    expect(findings[0]?.detail).toContain('fake AWS secret canary');
    expect(countFindingsBySeverity(findings).CRITICAL).toBe(1);
    expect(countFindingsBySeverity(findings).MEDIUM).toBeGreaterThanOrEqual(1);
  });

  it('deduplicates repeated equivalent findings', () => {
    const analysis = emptyAnalysis();
    analysis.networkRequests = [
      {
        package: 'packages/malice-local',
        host: 'example.com',
        method: 'GET',
        url: 'https://example.com/a',
        timestamp: 1,
      },
      {
        package: 'packages/malice-local',
        host: 'example.com',
        method: 'GET',
        url: 'https://example.com/a',
        timestamp: 2,
      },
    ];

    expect(buildFindings(analysis, emptyGraph())).toHaveLength(1);
  });
});
