import { resolveGraphNodeId } from './graph.js';
import type { DependencyGraph } from './types.js';

export type AttributionConfidence = 'high' | 'medium' | 'low';

export interface TraceAttributionEnv {
  npmPackageName?: string;
  npmPackageVersion?: string;
  npmLifecycleEvent?: string;
  initCwd?: string;
}

export function parseAttributionFromDetails(
  details: Record<string, unknown>
): TraceAttributionEnv | undefined {
  const raw = details.attribution as TraceAttributionEnv | undefined;
  return raw;
}

export function resolveAttributionConfidence(
  cwdPackageId: string,
  env: TraceAttributionEnv | undefined,
  graph: DependencyGraph
): AttributionConfidence {
  if (!env?.npmPackageName) {
    if (cwdPackageId === 'install-root' || cwdPackageId === 'unknown') return 'low';
    return resolveGraphNodeId(graph, cwdPackageId) ? 'medium' : 'low';
  }

  const npmName = env.npmPackageName;
  const graphFromCwd = resolveGraphNodeId(graph, cwdPackageId);
  const graphFromNpm = Array.from(graph.nodes.values()).find((n) => n.name === npmName);

  if (graphFromCwd && graphFromNpm && graphFromCwd === graphFromNpm.id) return 'high';
  if (graphFromNpm) return 'medium';
  return 'low';
}
