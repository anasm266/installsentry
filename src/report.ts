import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ReportData, DependencyGraph, AnalysisResult } from './types.js';

export function generateReport(data: ReportData, outputPath: string) {
  const html = buildHtml(data);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, html, 'utf-8');
}

function buildHtml(data: ReportData): string {
  const { graph, analysis, targetPackage, targetVersion } = data;

  const nodesJson = JSON.stringify(
    Array.from(graph.nodes.values()).map((n) => ({
      id: n.id,
      name: n.name,
      version: n.version,
      hasLifecycle: n.hasLifecycleScripts,
      // Short, unique label for the graph (full lockfile path is in id / blast paths)
      label:
        n.id
          .replace(/\\/g, '/')
          .split('node_modules/')
          .filter(Boolean)
          .join(' / ') + `@${n.version}`,
      risk: 0, // filled client-side
    }))
  );

  const edgesJson = JSON.stringify(graph.edges);
  const analysisJson = JSON.stringify(analysis);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>InstallSentry Report — ${escapeHtml(targetPackage)}@${targetVersion}</title>
  <script src="https://unpkg.com/cytoscape@3.26.0/dist/cytoscape.min.js"></script>
  <style>
    :root { --bg:#0f1117; --fg:#e6edf3; --accent:#58a6ff; --danger:#f85149; --warn:#d29922; --ok:#3fb950; }
    * { box-sizing:border-box; }
    body { margin:0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; background:var(--bg); color:var(--fg); }
    header { padding:1.5rem 2rem; border-bottom:1px solid #30363d; display:flex; align-items:center; justify-content:space-between; }
    h1 { margin:0; font-size:1.25rem; }
    .badge { padding:.35rem .6rem; border-radius:999px; font-size:.75rem; font-weight:600; background:#21262d; border:1px solid #30363d; }
    .badge.danger { background:rgba(248,81,73,.15); color:var(--danger); border-color:rgba(248,81,73,.3); }
    .layout { display:grid; grid-template-columns: minmax(0, 320px) 1fr; height:calc(100vh - 73px); }
    .sidebar { border-right:1px solid #30363d; overflow:auto; padding:1rem; min-width:0; }
    .section { margin-bottom:1.5rem; min-width:0; }
    .section h3 { margin:0 0 .5rem; font-size:.875rem; text-transform:uppercase; letter-spacing:.05em; color:#8b949e; }
    .alert { padding:.75rem; border-radius:6px; background:rgba(248,81,73,.1); border:1px solid rgba(248,81,73,.25); margin-bottom:.5rem; max-width:100%; overflow-wrap:anywhere; word-break:break-word; }
    .alert-title { font-weight:600; color:var(--danger); font-size:.85rem; word-break:break-word; }
    .alert-meta { font-size:.8rem; color:#8b949e; margin-top:.25rem; overflow-wrap:anywhere; word-break:break-word; hyphens:manual; }
    .timeline-item { display:flex; gap:.75rem; padding:.6rem; border-radius:6px; background:#161b22; margin-bottom:.4rem; min-width:0; }
    .timeline-time { font-variant-numeric:tabular-nums; color:#8b949e; font-size:.8rem; flex-shrink:0; }
    .timeline-body { font-size:.85rem; min-width:0; flex:1; overflow-wrap:anywhere; word-break:break-word; }
    #cy { background:var(--bg); min-width:0; }
    .legend { display:flex; gap:.5rem; flex-wrap:wrap; margin-top:.5rem; }
    .legend span { display:inline-flex; align-items:center; gap:.35rem; font-size:.8rem; color:#8b949e; }
    .dot { width:8px; height:8px; border-radius:50%; display:inline-block; }
  </style>
</head>
<body>
  <header>
    <h1>InstallSentry Report</h1>
    <div>
      <span class="badge">${escapeHtml(targetPackage)}@${targetVersion}</span>
      <span class="badge danger">${analysis.secretHits.length} secret hits</span>
      <span class="badge">${analysis.networkRequests.length} network requests</span>
    </div>
  </header>
  <div class="layout">
    <aside class="sidebar">
      <div class="section">
        <h3>Secret Canary Alerts</h3>
        ${analysis.secretHits.length === 0 ? '<p style="color:#8b949e;font-size:.85rem;">No secret reads detected.</p>' : analysis.secretHits.map(h => `
          <div class="alert">
            <div class="alert-title">${escapeHtml(h.canary)}</div>
            <div class="alert-meta">Package: ${escapeHtml(h.package)}<br>File: ${escapeHtml(h.filePath)}</div>
          </div>
        `).join('')}
      </div>
      <div class="section">
        <h3>Network Egress</h3>
        ${analysis.networkRequests.length === 0 ? '<p style="color:#8b949e;font-size:.85rem;">No network requests detected.</p>' : analysis.networkRequests.map(r => `
          <div class="timeline-item">
            <div class="timeline-time">${escapeHtml(r.method)}</div>
            <div class="timeline-body">${escapeHtml(r.host)}<br><span style="color:#8b949e;font-size:.75rem;">${escapeHtml(r.package)}</span></div>
          </div>
        `).join('')}
      </div>
      <div class="section">
        <h3>Blast Radius Paths</h3>
        ${analysis.blastRadiusPaths.slice(0, 10).map(p => `
          <div class="timeline-item">
            <div class="timeline-time">R${p.riskScore}</div>
            <div class="timeline-body">${escapeHtml(p.path.join(' → '))} → <strong>${escapeHtml(p.target)}</strong></div>
          </div>
        `).join('') || '<p style="color:#8b949e;font-size:.85rem;">No suspicious paths found.</p>'}
      </div>
      <div class="section">
        <h3>Legend</h3>
        <div class="legend">
          <span><span class="dot" style="background:var(--danger)"></span> Secret touched</span>
          <span><span class="dot" style="background:var(--warn)"></span> Network call</span>
          <span><span class="dot" style="background:var(--accent)"></span> Lifecycle script</span>
          <span><span class="dot" style="background:#8b949e"></span> Normal</span>
        </div>
      </div>
    </aside>
    <div id="cy"></div>
  </div>
  <script>
    const nodes = ${nodesJson};
    const edges = ${edgesJson};
    const analysis = ${analysisJson};

    const suspiciousPackages = new Set();
    analysis.secretHits.forEach(h => suspiciousPackages.add(h.package));
    analysis.networkRequests.forEach(r => suspiciousPackages.add(r.package));

    const cyNodes = nodes.map(n => {
      let color = '#8b949e';
      if (suspiciousPackages.has(n.id)) color = '#f85149';
      else if (n.hasLifecycle) color = '#58a6ff';
      return { data: { id: n.id, label: n.label, color, hasLifecycle: n.hasLifecycle } };
    });

    const cyEdges = edges.map(e => ({
      data: { id: e.from + '|' + e.to, source: e.from || 'root', target: e.to }
    }));

    // Synthetic project root: lockfile uses "" for top-level deps, edges use source "root".
    // Cytoscape requires every edge endpoint to be a real node — add root whenever missing
    // (the old condition accidentally skipped root when edges *did* use source "root").
    if (!cyNodes.some((n) => n.data.id === 'root')) {
      cyNodes.unshift({ data: { id: 'root', label: 'project: ${escapeHtml(targetPackage)}', color: '#3fb950' } });
    }

    const graphCount = cyNodes.length;
    const useSmallGraphLayout = graphCount <= 40;
    const layout = useSmallGraphLayout
      ? {
          name: 'concentric',
          fit: true,
          padding: 48,
          startAngle: -Math.PI / 2,
          concentric: (ele) => (ele.isNode() && ele.id() === 'root' ? 1 : 0),
          minNodeSpacing: 20,
          levelWidth: function () { return 1; },
          spacingFactor: 1.15,
        }
      : {
          name: 'cose',
          fit: true,
          padding: 12,
          nodeRepulsion: 2600,
          edgeElasticity: 0.22,
          gravity: 0.18,
          numIter: 900,
          idealEdgeLength: 11,
        };

    const cy = cytoscape({
      container: document.getElementById('cy'),
      elements: [...cyNodes, ...cyEdges],
      minZoom: 0.15,
      maxZoom: 2.5,
      wheelSensitivity: 0.35,
      style: [
        { selector: 'node', style: {
          'background-color': 'data(color)',
          'label': 'data(label)',
          'color': '#e6edf3',
          'font-size': '12px',
          'font-weight': 500,
          'text-valign': 'center',
          'text-halign': 'center',
          'text-wrap': 'wrap',
          'text-max-width': 240,
          'shape': 'round-rectangle',
          'width': 'label',
          'height': 'label',
          'padding': '12px 16px',
          'border-width': 1,
          'border-color': 'rgba(255,255,255,0.08)',
        }},
        { selector: 'node[id="root"]', style: {
          'text-max-width': 280,
          'font-size': '13px',
        }},
        { selector: 'edge', style: {
          'width': 2,
          'line-color': '#4a5563',
          'target-arrow-color': '#6a737d',
          'target-arrow-shape': 'triangle',
          'arrow-scale': 1.1,
          'curve-style': 'bezier',
        }}
      ],
      layout
    });
    cy.ready(function () {
      var pad = useSmallGraphLayout ? 64 : 40;
      try {
        cy.fit(cy.elements(), pad);
      } catch (e) {
        cy.fit();
      }
    });
  </script>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&#039;');
}
