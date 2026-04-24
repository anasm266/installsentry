import type { DependencyGraph, AnalysisResult } from './types.js';
import { resolveGraphNodeId } from './graph.js';

const SYNTHETIC_BLAST_HINT = 'not a specific lockfile package';

/** Real lockfile node ids on blast-radius paths; excludes `install-root` and synthetic text paths. */
export function computeBlastFocusNodeIds(graph: DependencyGraph, analysis: AnalysisResult): string[] {
  const s = new Set<string>();
  for (const p of analysis.blastRadiusPaths) {
    for (const seg of p.path) {
      if (seg.includes(SYNTHETIC_BLAST_HINT)) continue;
      if (graph.nodes.has(seg)) s.add(seg);
      else {
        const id = resolveGraphNodeId(graph, seg);
        if (id) s.add(id);
      }
    }
    if (graph.nodes.has(p.target)) s.add(p.target);
    else {
      const t = resolveGraphNodeId(graph, p.target);
      if (t) s.add(t);
    }
  }
  return [...s];
}

export function computeResolvedHighlightIds(graph: DependencyGraph, analysis: AnalysisResult): string[] {
  const out = new Set<string>();
  for (const h of analysis.secretHits) {
    if (graph.nodes.has(h.package)) out.add(h.package);
    else {
      const id = resolveGraphNodeId(graph, h.package);
      if (id) out.add(id);
    }
  }
  for (const r of analysis.networkRequests) {
    if (graph.nodes.has(r.package)) out.add(r.package);
    else {
      const id = resolveGraphNodeId(graph, r.package);
      if (id) out.add(id);
    }
  }
  return [...out];
}
