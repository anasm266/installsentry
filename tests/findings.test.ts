import { describe, expect, it } from 'vitest';
import { buildFindings, countFindingsBySeverity } from '../src/findings.js';
import type { AnalysisResult } from '../src/types.js';

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

    const findings = buildFindings(analysis);

    expect(findings.map((finding) => finding.severity)).toEqual([
      'CRITICAL',
      'MEDIUM',
      'MEDIUM',
    ]);
    expect(findings[0]).toEqual({
      severity: 'CRITICAL',
      package: 'packages/malice-local',
      detail: 'sent fake AWS secret canary to example.com',
    });
    expect(countFindingsBySeverity(findings)).toEqual({
      CRITICAL: 1,
      HIGH: 0,
      MEDIUM: 2,
      LOW: 0,
    });
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

    expect(buildFindings(analysis)).toHaveLength(1);
  });
});
