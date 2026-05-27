import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { JsonReport } from './output/json.js';
import { parseJsonUtf8 } from './json-utf8.js';
import type { Finding } from './findings.js';

export interface BaselineDiff {
  newFindings: Finding[];
  newNetworkHosts: string[];
  newSecretHits: number;
  removedFindings: Finding[];
}

function findingKey(f: Finding): string {
  return `${f.id || ''}\0${f.severity}\0${f.package}\0${f.detail}`;
}

export function loadBaseline(path: string): JsonReport | null {
  if (!existsSync(path)) return null;
  return parseJsonUtf8<JsonReport>(readFileSync(path, 'utf-8'));
}

export function saveBaseline(path: string, report: JsonReport): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(report, null, 2), 'utf-8');
}

export function diffReports(current: JsonReport, baseline: JsonReport): BaselineDiff {
  const baseKeys = new Set(baseline.findings.map(findingKey));
  const curKeys = new Set(current.findings.map(findingKey));

  const newFindings = current.findings.filter((f) => !baseKeys.has(findingKey(f)));
  const removedFindings = baseline.findings.filter((f) => !curKeys.has(findingKey(f)));

  const baseHosts = new Set(
    baseline.findings
      .filter((f) => f.id === 'network-egress' || f.detail.includes('request to'))
      .map((f) => f.detail)
  );
  const newNetworkHosts: string[] = [];
  for (const f of current.findings) {
    if (f.detail.includes('request to') && !baseHosts.has(f.detail)) {
      newNetworkHosts.push(f.detail);
    }
  }

  const newSecretHits = Math.max(
    0,
    current.analysis.secretHitCount - baseline.analysis.secretHitCount
  );

  return { newFindings, newNetworkHosts, newSecretHits, removedFindings };
}

export function diffHasBlockingChanges(diff: BaselineDiff): boolean {
  return diff.newFindings.some((f) => f.severity === 'CRITICAL' || f.severity === 'HIGH');
}
