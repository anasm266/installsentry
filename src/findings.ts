import { displayPackageIdForReport } from './attribution.js';
import type { AnalysisResult } from './types.js';

export type FindingSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface Finding {
  severity: FindingSeverity;
  package: string;
  detail: string;
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

export function buildFindings(analysis: AnalysisResult): Finding[] {
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
      severity: isNetworkExfil ? 'CRITICAL' : 'HIGH',
      package: displayPackageIdForReport(hit.package),
      detail,
    });
  }

  for (const request of analysis.networkRequests) {
    findings.push({
      severity: 'MEDIUM',
      package: displayPackageIdForReport(request.package),
      detail: `made ${request.method} request to ${request.host || request.url}`,
    });
  }

  const seen = new Set<string>();
  return findings
    .filter((finding) => {
      const key = `${finding.severity}\0${finding.package}\0${finding.detail}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

export function countFindingsBySeverity(findings: Finding[]): Record<FindingSeverity, number> {
  return findings.reduce<Record<FindingSeverity, number>>(
    (counts, finding) => {
      counts[finding.severity] += 1;
      return counts;
    },
    { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 }
  );
}
