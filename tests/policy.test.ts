import { describe, it, expect } from 'vitest';
import { resolveCiPolicy, ciShouldFailWithPolicy } from '../src/policy.js';
import type { AnalysisResult } from '../src/types.js';

function emptyAnalysis(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    events: [],
    secretHits: [],
    networkRequests: [],
    fileChanges: [],
    lifecycleExecutions: [],
    blastRadiusPaths: [],
    ...overrides,
  };
}

describe('resolveCiPolicy', () => {
  it('defaults to strict for ci', () => {
    const p = resolveCiPolicy(null, { defaultMode: 'strict' });
    expect(p.mode).toBe('strict');
  });

  it('reads balanced from config', () => {
    const p = resolveCiPolicy({ ci: { policy: 'balanced' } }, {});
    expect(p.mode).toBe('balanced');
  });
});

describe('ciShouldFailWithPolicy', () => {
  it('fails on secret canary', () => {
    const analysis = emptyAnalysis({
      secretHits: [
        {
          canary: 'x',
          package: 'pkg',
          filePath: '/tmp',
          timestamp: 1,
        },
      ],
    });
    const policy = resolveCiPolicy(null, { defaultMode: 'strict' });
    expect(ciShouldFailWithPolicy(analysis, policy)).toBe(true);
  });

  it('balanced does not fail on registry network alone', () => {
    const analysis = emptyAnalysis({
      networkRequests: [
        {
          package: 'root',
          host: 'registry.npmjs.org',
          method: 'GET',
          url: 'https://registry.npmjs.org/',
          timestamp: 1,
        },
      ],
    });
    const policy = resolveCiPolicy({ ci: { policy: 'balanced' } }, {});
    expect(ciShouldFailWithPolicy(analysis, policy)).toBe(false);
  });

  it('balanced fails on denylisted host', () => {
    const analysis = emptyAnalysis({
      networkRequests: [
        {
          package: 'pkg',
          host: 'evil.example',
          method: 'GET',
          url: 'https://evil.example/',
          timestamp: 1,
        },
      ],
    });
    const policy = resolveCiPolicy(
      { ci: { policy: 'balanced', denyHosts: ['evil.example'] } },
      {}
    );
    expect(ciShouldFailWithPolicy(analysis, policy)).toBe(true);
  });
});
