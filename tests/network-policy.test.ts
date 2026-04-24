import { describe, it, expect } from 'vitest';
import { mergeNetworkPolicy, isRequestAllowedByPolicy, getNetworkFindingsForCi, ciShouldFail } from '../src/network-policy.js';
import type { AnalysisResult } from '../src/types.js';

const empty = (): AnalysisResult => ({
  events: [],
  secretHits: [],
  networkRequests: [],
  fileChanges: [],
  lifecycleExecutions: [],
  blastRadiusPaths: [],
});

describe('network-policy', () => {
  it('uses strict mode when no allow list is set', () => {
    const p = mergeNetworkPolicy({ ci: { denyHosts: [] } }, undefined, undefined);
    expect(p.mode).toBe('strict');
  });

  it('uses allowlist when --allow-hosts is set', () => {
    const p = mergeNetworkPolicy(null, 'registry.npmjs.org', undefined);
    expect(p.mode).toBe('allowlist');
    expect(isRequestAllowedByPolicy('registry.npmjs.org', p)).toBe(true);
    expect(isRequestAllowedByPolicy('evil.com', p)).toBe(false);
  });

  it('deny overrides allow', () => {
    const p = mergeNetworkPolicy(
      { ci: { allowHosts: ['a.com', 'b.com'], denyHosts: ['b.com'] } },
      undefined,
      undefined
    );
    expect(p.mode).toBe('allowlist');
    expect(isRequestAllowedByPolicy('a.com', p)).toBe(true);
    expect(isRequestAllowedByPolicy('b.com', p)).toBe(false);
  });

  it('ciShouldFail on secret hits with allowlist for network', () => {
    const a = empty();
    a.networkRequests = [{ package: 'x', host: 'registry.npmjs.org', method: 'GET', url: 'u', timestamp: 0 }];
    a.secretHits = [];
    const p = mergeNetworkPolicy(null, 'registry.npmjs.org', undefined);
    expect(getNetworkFindingsForCi(a.networkRequests, p).length).toBe(0);
    expect(ciShouldFail(a, p)).toBe(false);
    a.secretHits = [{ canary: 'c', package: 'p', filePath: 'f', timestamp: 0 }];
    expect(ciShouldFail(a, p)).toBe(true);
  });
});
