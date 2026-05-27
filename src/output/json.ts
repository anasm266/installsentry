import { writeFileSync } from 'node:fs';
import type { AnalysisResult, DependencyGraph, ReportData } from '../types.js';
import { buildFindings } from '../findings.js';
import type { ResolvedCiPolicy } from '../policy.js';
import type { PackageManagerKind } from '../package-manager.js';

export const JSON_REPORT_VERSION = '1.0';

export interface JsonReport {
  installsentryReportVersion: string;
  installsentryVersion: string;
  generatedAt: string;
  target: { name: string; version: string };
  packageManager: PackageManagerKind;
  nodeVersion: string;
  findings: ReturnType<typeof buildFindings>;
  analysis: {
    secretHitCount: number;
    networkRequestCount: number;
    traceEventCount: number;
    lifecycleScriptPackageCount: number;
  };
  graph: {
    nodeCount: number;
    edgeCount: number;
    lifecycleScriptPackages: string[];
  };
  policy?: {
    mode: string;
    ciPassed: boolean;
  };
}

export function buildJsonReport(
  data: ReportData,
  meta: {
    packageManager: PackageManagerKind;
    installsentryVersion: string;
    policy?: ResolvedCiPolicy;
    ciPassed?: boolean;
  }
): JsonReport {
  const findings = buildFindings(data.analysis, data.graph);
  const lifecycleScriptPackages = Array.from(data.graph.nodes.values())
    .filter((n) => n.hasLifecycleScripts)
    .map((n) => `${n.name}@${n.version}`);

  return {
    installsentryReportVersion: JSON_REPORT_VERSION,
    installsentryVersion: meta.installsentryVersion,
    generatedAt: new Date().toISOString(),
    target: { name: data.targetPackage, version: data.targetVersion },
    packageManager: meta.packageManager,
    nodeVersion: process.version,
    findings,
    analysis: {
      secretHitCount: data.analysis.secretHits.length,
      networkRequestCount: data.analysis.networkRequests.length,
      traceEventCount: data.analysis.events.length,
      lifecycleScriptPackageCount: lifecycleScriptPackages.length,
    },
    graph: {
      nodeCount: data.graph.nodes.size,
      edgeCount: data.graph.edges.length,
      lifecycleScriptPackages,
    },
    policy: meta.policy
      ? {
          mode: meta.policy.mode,
          ciPassed: meta.ciPassed ?? true,
        }
      : undefined,
  };
}

export function writeJsonReport(path: string, report: JsonReport): void {
  writeFileSync(path, JSON.stringify(report, null, 2), 'utf-8');
}
