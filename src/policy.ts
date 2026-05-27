import type { InstallsentryConfig } from './config.js';
import type { AnalysisResult } from './types.js';
import {
  mergeNetworkPolicy,
  getNetworkFindingsForCi,
  type ResolvedNetworkPolicy,
} from './network-policy.js';
import { buildFindings, type Finding } from './findings.js';

export type CiPolicyMode = 'strict' | 'balanced' | 'custom';

export type FailOnRule = 'secret-canary' | 'denied-network' | 'network-egress';

export interface ResolvedCiPolicy {
  mode: CiPolicyMode;
  failOn: Set<FailOnRule>;
  network: ResolvedNetworkPolicy;
}

const DEFAULT_FAIL_ON: FailOnRule[] = ['secret-canary', 'denied-network'];

export function parsePolicyMode(value: string | undefined): CiPolicyMode {
  const v = (value || '').toLowerCase().trim();
  if (v === 'balanced' || v === 'strict' || v === 'custom') return v;
  return 'strict';
}

export function resolveCiPolicy(
  config: InstallsentryConfig | null,
  options: {
    policyCli?: string;
    allowHostsCli?: string;
    denyHostsCli?: string;
    /** `ci` subcommand defaults strict; `run --ci` can default balanced */
    defaultMode?: CiPolicyMode;
  }
): ResolvedCiPolicy {
  const network = mergeNetworkPolicy(config, options.allowHostsCli, options.denyHostsCli);
  const mode = parsePolicyMode(
    options.policyCli ?? config?.ci?.policy ?? options.defaultMode ?? 'strict'
  );

  const failOnList = config?.ci?.failOn?.length
    ? (config.ci.failOn as FailOnRule[])
    : DEFAULT_FAIL_ON;
  const failOn = new Set<FailOnRule>(failOnList);

  return { mode, failOn, network };
}

export function getSecretFindingsForCi(findings: Finding[]): Finding[] {
  return findings.filter((f) => f.severity === 'CRITICAL' || f.severity === 'HIGH');
}

export function getNetworkViolationsForCi(
  analysis: AnalysisResult,
  policy: ResolvedCiPolicy
): AnalysisResult['networkRequests'] {
  if (policy.mode === 'balanced') {
    return analysis.networkRequests.filter((r) =>
      policy.network.deny.has(normalizeHostSimple(r.host))
    );
  }
  if (policy.mode === 'strict') {
    return getNetworkFindingsForCi(analysis.networkRequests, policy.network);
  }
  const denied = getNetworkFindingsForCi(analysis.networkRequests, policy.network);
  if (policy.failOn.has('network-egress')) {
    return analysis.networkRequests;
  }
  if (policy.failOn.has('denied-network')) {
    return denied;
  }
  return [];
}

function normalizeHostSimple(host: string): string {
  return (host || '').toLowerCase().trim().split(':')[0];
}

export function ciShouldFailWithPolicy(
  analysis: AnalysisResult,
  policy: ResolvedCiPolicy
): boolean {
  const findings = buildFindings(analysis, { nodes: new Map(), edges: [] });
  const secrets = getSecretFindingsForCi(findings);
  if (policy.failOn.has('secret-canary') && secrets.length > 0) return true;

  const networkViolations = getNetworkViolationsForCi(analysis, policy);
  if (networkViolations.length > 0) return true;

  return false;
}

export function isNetworkCiFailure(
  analysis: AnalysisResult,
  policy: ResolvedCiPolicy
): boolean {
  return getNetworkViolationsForCi(analysis, policy).length > 0;
}
