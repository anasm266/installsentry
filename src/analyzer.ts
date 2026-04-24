import type { TraceEvent, AnalysisResult, DependencyGraph, GraphNode } from './types.js';
import { isNonGraphPackageId } from './attribution.js';
import { calculateRiskScore, findPathsToRoot, resolveGraphNodeId } from './graph.js';

export function analyzeTrace(events: TraceEvent[], graph: DependencyGraph): AnalysisResult {
  const secretHits: AnalysisResult['secretHits'] = [];
  const networkRequests: AnalysisResult['networkRequests'] = [];
  const fileChanges: AnalysisResult['fileChanges'] = [];
  const lifecycleExecutions: AnalysisResult['lifecycleExecutions'] = [];

  for (const event of events) {
    switch (event.type) {
      case 'fs.read': {
        const path = String(event.details.path || '');
        const canaries = (event.details.canaries as string[]) || [];
        for (const canary of canaries) {
          secretHits.push({
            canary,
            package: event.package || 'unknown',
            filePath: path,
            timestamp: event.timestamp,
          });
        }
        fileChanges.push({
          package: event.package || 'unknown',
          path,
          operation: 'read',
          timestamp: event.timestamp,
        });
        break;
      }
      case 'fs.write': {
        fileChanges.push({
          package: event.package || 'unknown',
          path: String(event.details.path || ''),
          operation: 'write',
          timestamp: event.timestamp,
        });
        break;
      }
      case 'http.request': {
        const url = String(event.details.url || '');
        const canaries = (event.details.canaries as string[]) || [];
        for (const canary of canaries) {
          secretHits.push({
            canary,
            package: event.package || 'unknown',
            filePath: url,
            timestamp: event.timestamp,
          });
        }
        networkRequests.push({
          package: event.package || 'unknown',
          host: String(event.details.host || ''),
          method: String(event.details.method || 'GET'),
          url,
          timestamp: event.timestamp,
        });
        break;
      }
      case 'lifecycle.start': {
        // Handled by lifecycle.end pairing
        break;
      }
      case 'lifecycle.end': {
        lifecycleExecutions.push({
          package: event.package || 'unknown',
          script: event.script || 'unknown',
          durationMs: Number(event.details.durationMs || 0),
          exitCode: Number(event.details.exitCode || 0),
          timestamp: event.timestamp,
        });
        break;
      }
      case 'child_process.spawn': {
        // Could be added to lifecycle or separate category
        break;
      }
    }
  }

  // Determine blast radius: packages with high risk + suspicious events
  const suspiciousPackages = new Set<string>();
  for (const hit of secretHits) suspiciousPackages.add(hit.package);
  for (const req of networkRequests) suspiciousPackages.add(req.package);
  for (const change of fileChanges) {
    if (change.operation === 'write' && !change.path.includes('node_modules')) {
      suspiciousPackages.add(change.package);
    }
  }

  const blastRadiusPaths: AnalysisResult['blastRadiusPaths'] = [];
  for (const pkg of suspiciousPackages) {
    const graphId = resolveGraphNodeId(graph, pkg);
    const node = graphId ? graph.nodes.get(graphId) : undefined;
    if (node && graphId) {
      const paths = findPathsToRoot(graph, graphId);
      const riskScore =
        calculateRiskScore(node) +
        (secretHits.some((h) => h.package === pkg) ? 5 : 0) +
        (networkRequests.some((r) => r.package === pkg) ? 3 : 0);
      for (const path of paths) {
        blastRadiusPaths.push({
          target: graphId,
          path,
          riskScore,
        });
      }
    } else if (isNonGraphPackageId(pkg)) {
      const hasSecret = secretHits.some((h) => h.package === pkg);
      const hasNet = networkRequests.some((r) => r.package === pkg);
      if (hasSecret || hasNet) {
        const riskScore = 1 + (hasSecret ? 5 : 0) + (hasNet ? 3 : 0);
        blastRadiusPaths.push({
          target: pkg,
          path: ['(not a specific lockfile package — project install / npm)'],
          riskScore,
        });
      }
    }
  }

  // Sort by risk descending
  blastRadiusPaths.sort((a, b) => b.riskScore - a.riskScore);

  return {
    events,
    secretHits,
    networkRequests,
    fileChanges,
    lifecycleExecutions,
    blastRadiusPaths,
  };
}
