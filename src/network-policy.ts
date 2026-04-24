import type { InstallsentryConfig } from './config.js';
import type { AnalysisResult } from './types.js';
import { splitHostList } from './config.js';

/**
 * - **strict** — any outbound network in trace fails CI (default when no allow list).
 * - **allowlist** — only requests whose host is not in `allow` (or is in `deny`) are CI failures.
 */
export type NetworkPolicyMode = 'strict' | 'allowlist';

export interface ResolvedNetworkPolicy {
  mode: NetworkPolicyMode;
  allow: Set<string>;
  deny: Set<string>;
}

function normalizeHost(host: string): string {
  const h0 = (host || '').toLowerCase().trim();
  if (h0.startsWith('[') && h0.includes(']')) {
    return h0;
  }
  const colon = h0.indexOf(':');
  if (colon > 0 && h0.indexOf(':', colon + 1) === -1) {
    return h0.slice(0, colon);
  }
  return h0;
}

export function mergeNetworkPolicy(
  file: InstallsentryConfig | null,
  allowHostsCli: string | undefined,
  denyHostsCli: string | undefined
): ResolvedNetworkPolicy {
  const deny = new Set<string>([
    ...(file?.ci?.denyHosts || []).map((h) => normalizeHost(h)),
    ...splitHostList(denyHostsCli).map((h) => normalizeHost(h)),
  ]);
  const cfg = file?.ci;
  const hasAllowHostsKey = cfg != null && Object.prototype.hasOwnProperty.call(cfg, 'allowHosts');
  const allowFromFile = (hasAllowHostsKey && Array.isArray(cfg?.allowHosts) ? cfg?.allowHosts : []) as string[];
  const allowFromCli = splitHostList(allowHostsCli);
  const allow = new Set<string>([...allowFromFile, ...allowFromCli].map((h) => normalizeHost(h)));

  const hasExplicitAllow = hasAllowHostsKey || allowFromCli.length > 0;
  if (!hasExplicitAllow) {
    return { mode: 'strict', allow: new Set(), deny };
  }
  return { mode: 'allowlist', allow, deny };
}

export function isRequestAllowedByPolicy(
  host: string,
  policy: ResolvedNetworkPolicy
): boolean {
  const h = normalizeHost(host);
  if (policy.deny.has(h)) return false;
  if (policy.mode === 'strict') return false;
  return policy.allow.has(h);
}

/**
 * All network lines that are CI failures (denied by policy, or not allowlisted, or any in strict).
 */
export function getNetworkFindingsForCi(
  networkRequests: AnalysisResult['networkRequests'],
  policy: ResolvedNetworkPolicy
): AnalysisResult['networkRequests'] {
  return networkRequests.filter((r) => !isRequestAllowedByPolicy(r.host, policy));
}

export function ciShouldFail(
  analysis: AnalysisResult,
  policy: ResolvedNetworkPolicy
): boolean {
  if (analysis.secretHits.length > 0) return true;
  return getNetworkFindingsForCi(analysis.networkRequests, policy).length > 0;
}
