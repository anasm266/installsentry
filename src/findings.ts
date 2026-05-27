import { displayPackageIdForReport } from './attribution.js';
import type { AnalysisResult, DependencyGraph } from './types.js';
import {
  parseAttributionFromDetails,
  resolveAttributionConfidence,
  type AttributionConfidence,
} from './attribution-v2.js';
import { buildEvasionHints } from './evasion.js';

export type FindingSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface FindingAttribution {
  cwdPackage: string;
  npmPackageName?: string;
  npmLifecycleEvent?: string;
  confidence: AttributionConfidence;
}

export interface Finding {
  id: string;
  severity: FindingSeverity;
  package: string;
  title: string;
  detail: string;
  evidence?: Record<string, unknown>;
  attribution: FindingAttribution;
}

export const SEVERITY_ORDER: Record<FindingSeverity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

export function canaryLabel(canary: string): string {
  const lower = canary.toLowerCase();
  if (lower.includes('aws_secret')) return 'fake AWS secret canary';
  if (lower.includes('aws_key')) return 'fake AWS access key canary';
  if (lower.includes('npm')) return 'fake npm token canary';
  if (lower.includes('github')) return 'fake GitHub token canary';
  if (lower.includes('ssh')) return 'fake SSH key canary';
  return 'fake secret canary';
}

function attributionForPackage(
  packageId: string,
  graph: DependencyGraph,
  env?: ReturnType<typeof parseAttributionFromDetails>
): FindingAttribution {
  return {
    cwdPackage: packageId,
    npmPackageName: env?.npmPackageName,
    npmLifecycleEvent: env?.npmLifecycleEvent,
    confidence: resolveAttributionConfidence(packageId, env, graph),
  };
}

export function buildFindings(analysis: AnalysisResult, graph: DependencyGraph): Finding[] {
  const findings: Finding[] = [];

  for (const hit of analysis.secretHits) {
    const isNetworkExfil = /^https?:\/\//i.test(hit.filePath);
    let detail = `${isNetworkExfil ? 'sent' : 'read'} ${canaryLabel(hit.canary)}`;
    if (isNetworkExfil) {
      try {
        detail += ` to ${new URL(hit.filePath).host}`;
      } catch {
        detail += ' in network request';
      }
    } else if (hit.filePath) {
      detail += ` from ${hit.filePath}`;
    }
    findings.push({
      id: isNetworkExfil ? 'secret-canary-network' : 'secret-canary-read',
      severity: isNetworkExfil ? 'CRITICAL' : 'HIGH',
      package: displayPackageIdForReport(hit.package),
      title: isNetworkExfil ? 'Secret canary exfiltration' : 'Secret canary read',
      detail,
      evidence: { canary: hit.canary, filePath: hit.filePath },
      attribution: attributionForPackage(hit.package, graph),
    });
  }

  for (const request of analysis.networkRequests) {
    findings.push({
      id: 'network-egress',
      severity: 'MEDIUM',
      package: displayPackageIdForReport(request.package),
      title: 'Network egress during install',
      detail: `made ${request.method} request to ${request.host || request.url}`,
      evidence: { url: request.url, host: request.host, method: request.method },
      attribution: attributionForPackage(request.package, graph),
    });
  }

  const evasion = buildEvasionHints(analysis.events).map((h) => ({
    ...h,
    package: displayPackageIdForReport(h.package),
  }));
  findings.push(...evasion);

  const seen = new Set<string>();
  return findings
    .filter((finding) => {
      const key = `${finding.id}\0${finding.severity}\0${finding.package}\0${finding.detail}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

export function countFindingsBySeverity(
  findings: Finding[]
): Record<FindingSeverity, number> {
  return findings.reduce<Record<FindingSeverity, number>>(
    (counts, finding) => {
      if (finding.severity in counts) counts[finding.severity] += 1;
      return counts;
    },
    { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 }
  );
}
