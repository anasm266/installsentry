import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { displayPackageIdForReport } from './attribution.js';
import { buildFindings, countFindingsBySeverity, type Finding, type FindingSeverity } from './findings.js';
import { computeBlastFocusNodeIds, computeResolvedHighlightIds } from './report-graph.js';
import type { ReportData } from './types.js';

const LARGE_GRAPH_THRESHOLD = 40;

function nodeLabel(n: {
  id: string;
  version: string;
}): string {
  return (
    n.id
      .replace(/\\/g, '/')
      .split('node_modules/')
      .filter(Boolean)
      .join(' / ') + `@${n.version}`
  );
}

export function generateReport(data: ReportData, outputPath: string) {
  const html = buildHtml(data);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, html, 'utf-8');
}

function buildHtml(data: ReportData): string {
  const { graph, analysis, targetPackage, targetVersion } = data;
  const findings = buildFindings(analysis);
  const findingCounts = countFindingsBySeverity(findings);

  const baseNodes = Array.from(graph.nodes.values()).map((n) => ({
    id: n.id,
    name: n.name,
    version: n.version,
    hasLifecycle: n.hasLifecycleScripts,
    label: nodeLabel(n),
  }));

  const nodesJson = JSON.stringify(baseNodes);
  const edgesJson = JSON.stringify(graph.edges);
  const analysisJson = JSON.stringify(analysis);
  const blastFocusNodeIds = computeBlastFocusNodeIds(graph, analysis);
  const resolvedHighlightIds = computeResolvedHighlightIds(graph, analysis);
  const blastFocusJson = JSON.stringify(blastFocusNodeIds);
  const highlightJson = JSON.stringify(resolvedHighlightIds);

  const hasLifecycle = baseNodes.some((n) => n.hasLifecycle);
  const numNodesWithRoot = baseNodes.length + 1; // + synthetic root
  const defaultToFocused =
    numNodesWithRoot > LARGE_GRAPH_THRESHOLD &&
    (blastFocusNodeIds.length > 0 || hasLifecycle);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>InstallSentry Report — ${escapeHtml(targetPackage)}@${escapeHtml(targetVersion)}</title>
  <script src="https://unpkg.com/cytoscape@3.26.0/dist/cytoscape.min.js"></script>
  <style>
    :root { --bg:#0f1117; --fg:#e6edf3; --accent:#58a6ff; --danger:#f85149; --warn:#d29922; --ok:#3fb950; }
    * { box-sizing:border-box; }
    body { margin:0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; background:var(--bg); color:var(--fg); }
    header { padding:1.5rem 2rem; border-bottom:1px solid #30363d; }
    h1 { margin:0; font-size:1.25rem; }
    .header-row { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:1rem; }
    .graph-tools { display:flex; flex-wrap:wrap; align-items:center; gap:0.75rem; }
    .graph-tools label { font-size:0.8rem; color:#8b949e; }
    .graph-tools select { background:#161b22; color:var(--fg); border:1px solid #30363d; border-radius:6px; padding:0.35rem 0.6rem; font-size:0.85rem; }
    .graph-hint { font-size:0.8rem; color:#8b949e; max-width:320px; }
    .badges { display:flex; flex-wrap:wrap; gap:0.5rem; }
    .badge { padding:.35rem .6rem; border-radius:999px; font-size:.75rem; font-weight:600; background:#21262d; border:1px solid #30363d; }
    .badge.danger { background:rgba(248,81,73,.15); color:var(--danger); border-color:rgba(248,81,73,.3); }
    .badge.warn { background:rgba(210,153,34,.12); color:var(--warn); border-color:rgba(210,153,34,.3); }
    .layout { display:grid; grid-template-columns: minmax(0, 320px) 1fr; height:calc(100vh - 120px); }
    .sidebar { border-right:1px solid #30363d; overflow:auto; padding:1rem; min-width:0; }
    .section { margin-bottom:1.5rem; min-width:0; }
    .section h3 { margin:0 0 .5rem; font-size:.875rem; text-transform:uppercase; letter-spacing:.05em; color:#8b949e; }
    .alert { padding:.75rem; border-radius:6px; background:rgba(248,81,73,.1); border:1px solid rgba(248,81,73,.25); margin-bottom:.5rem; max-width:100%; overflow-wrap:anywhere; word-break:break-word; }
    .alert-title { font-weight:600; color:var(--danger); font-size:.85rem; word-break:break-word; }
    .alert-meta { font-size:.8rem; color:#8b949e; margin-top:.25rem; overflow-wrap:anywhere; word-break:break-word; hyphens:manual; }
    .finding { padding:.7rem; border-radius:6px; background:#161b22; border:1px solid #30363d; margin-bottom:.45rem; min-width:0; }
    .finding-row { display:flex; align-items:center; justify-content:space-between; gap:.6rem; margin-bottom:.35rem; }
    .finding-severity { border-radius:999px; padding:.16rem .45rem; font-size:.68rem; font-weight:700; letter-spacing:.02em; border:1px solid #30363d; flex-shrink:0; }
    .finding-severity.critical { color:var(--danger); background:rgba(248,81,73,.14); border-color:rgba(248,81,73,.35); }
    .finding-severity.high { color:#ff9b93; background:rgba(248,81,73,.08); border-color:rgba(248,81,73,.22); }
    .finding-severity.medium { color:var(--warn); background:rgba(210,153,34,.12); border-color:rgba(210,153,34,.3); }
    .finding-severity.low { color:#8b949e; background:#21262d; }
    .finding-package { font-size:.78rem; color:#8b949e; min-width:0; overflow-wrap:anywhere; word-break:break-word; }
    .finding-detail { font-size:.86rem; line-height:1.35; overflow-wrap:anywhere; word-break:break-word; }
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
    <div class="header-row">
    <h1>InstallSentry Report</h1>
    <div class="graph-tools">
      <label for="viewMode">Graph</label>
      <select id="viewMode" aria-label="Graph view mode">
        <option value="full"${!defaultToFocused ? ' selected' : ''}>Full dependency graph</option>
        <option value="blast"${
          defaultToFocused && blastFocusNodeIds.length > 0 ? ' selected' : ''
        }>Focused (blast / alerts)</option>
        <option value="lifecycle"${
          defaultToFocused && blastFocusNodeIds.length === 0 && hasLifecycle ? ' selected' : ''
        }>Lifecycle scripts only</option>
      </select>
      <span class="graph-hint" id="viewHint"></span>
    </div>
    <div class="badges">
      <span class="badge">${escapeHtml(targetPackage)}@${escapeHtml(targetVersion)}</span>
      <span class="badge danger">${findingCounts.CRITICAL} critical</span>
      <span class="badge danger">${findingCounts.HIGH} high</span>
      <span class="badge warn">${findingCounts.MEDIUM} medium</span>
      <span class="badge danger">${analysis.secretHits.length} secret hits</span>
      <span class="badge">${analysis.networkRequests.length} network requests</span>
    </div>
    </div>
  </header>
  <div class="layout">
    <aside class="sidebar">
      <div class="section">
        <h3>Findings</h3>
        ${renderFindings(findings)}
      </div>
      <div class="section">
        <h3>Secret Canary Alerts</h3>
        ${
          analysis.secretHits.length === 0
            ? '<p style="color:#8b949e;font-size:.85rem;">No secret reads detected.</p>'
            : analysis.secretHits
                .map(
                  (h) => `
          <div class="alert">
            <div class="alert-title">${escapeHtml(h.canary)}</div>
            <div class="alert-meta">Package: ${escapeHtml(displayPackageIdForReport(h.package))}<br>File: ${escapeHtml(h.filePath)}</div>
          </div>
        `
                )
                .join('')
        }
      </div>
      <div class="section">
        <h3>Network Egress</h3>
        ${
          analysis.networkRequests.length === 0
            ? '<p style="color:#8b949e;font-size:.85rem;">No network requests detected.</p>'
            : analysis.networkRequests
                .map(
                  (r) => `
          <div class="timeline-item">
            <div class="timeline-time">${escapeHtml(r.method)}</div>
            <div class="timeline-body">${escapeHtml(r.host)}<br><span style="color:#8b949e;font-size:.75rem;">${escapeHtml(displayPackageIdForReport(r.package))}</span></div>
          </div>
        `
                )
                .join('')
        }
      </div>
      <div class="section">
        <h3>Blast Radius Paths</h3>
        ${
          analysis.blastRadiusPaths.slice(0, 10).map(
            (p) => `
          <div class="timeline-item">
            <div class="timeline-time">R${p.riskScore}</div>
            <div class="timeline-body">${escapeHtml(p.path.join(' → '))} → <strong>${escapeHtml(displayPackageIdForReport(p.target))}</strong></div>
          </div>
        `
          ).join('') || '<p style="color:#8b949e;font-size:.85rem;">No suspicious paths found.</p>'
        }
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
    const baseNodes = ${nodesJson};
    const edges = ${edgesJson};
    const blastFocusNodeIds = new Set(${blastFocusJson});
    const highlightIds = new Set(${highlightJson});
    const targetRootLabel = 'project: ${escapeHtml(targetPackage)}';
    const THRESH = ${LARGE_GRAPH_THRESHOLD};

    const SYNTHETIC_FALLBACK = 'Blast view had no lockfile path — showing';

    function truncateLabel(text, isFull) {
      if (!isFull || !text || text.length <= 72) return text;
      return text.slice(0, 34) + '…' + text.slice(-30);
    }

    function colorFor(n) {
      if (n.id === 'root') return '#3fb950';
      if (highlightIds.has(n.id)) return '#f85149';
      if (n.hasLifecycle) return '#58a6ff';
      return '#8b949e';
    }

    function getIdSet(mode) {
      if (mode === 'full') {
        return new Set(baseNodes.map((n) => n.id).concat('root'));
      }
      if (mode === 'blast' && blastFocusNodeIds.size > 0) {
        return new Set(['root', ...Array.from(blastFocusNodeIds)]);
      }
      const s = new Set(['root']);
      for (const n of baseNodes) {
        if (n.hasLifecycle) s.add(n.id);
      }
      return s;
    }

    function buildElements(mode) {
      const isFull = mode === 'full';
      const idSet = getIdSet(mode);
      const nodesIn = baseNodes
        .filter((n) => idSet.has(n.id))
        .map((n) => ({
          data: {
            id: n.id,
            label: truncateLabel(n.label, isFull),
            hasLifecycle: n.hasLifecycle,
            color: colorFor(n),
          },
        }));
      if (idSet.has('root') && !nodesIn.some((x) => x.data.id === 'root')) {
        nodesIn.unshift({
          data: { id: 'root', label: targetRootLabel, hasLifecycle: false, color: '#3fb950' },
        });
      }
      const edgeList = [];
      for (const e of edges) {
        const s = e.from || 'root';
        const t = e.to;
        if (!idSet.has(s) || !idSet.has(t)) continue;
        edgeList.push({
          data: { id: s + '|' + t, source: s, target: t },
        });
      }
      return { nodes: nodesIn, extraEdges: edgeList };
    }

    function pickLayout(mode, nCount) {
      if (mode === 'full' && nCount > THRESH) {
        return {
          name: 'cose',
          fit: true,
          padding: 20,
          nodeRepulsion: 1.2e4,
          nodeOverlap: 20,
          edgeElasticity: 0.15,
          gravity: 0.08,
          numIter: 2000,
          initialTemp: 2000,
          coolingFactor: 0.9,
          idealEdgeLength: 32,
        };
      }
      if (mode === 'full') {
        return {
          name: 'concentric',
          fit: true,
          padding: 48,
          startAngle: -Math.PI / 2,
          concentric: (ele) => (ele.isNode() && ele.id() === 'root' ? 1 : 0),
          minNodeSpacing: 20,
          levelWidth: function () { return 1; },
          spacingFactor: 1.15,
        };
      }
      return {
        name: 'breadthfirst',
        fit: true,
        padding: 56,
        directed: true,
        circle: true,
        roots: '#root',
        spacingFactor: 1.35,
      };
    }

    function setHint(text) {
      var el = document.getElementById('viewHint');
      if (el) el.textContent = text || '';
    }

    var cy;
    var numNodesWithRoot = baseNodes.length + 1;
    function mount(mode) {
      if (cy) {
        try { cy.destroy(); } catch (e) {}
        cy = null;
      }
      if (mode === 'blast' && blastFocusNodeIds.size === 0) {
        setHint(SYNTHETIC_FALLBACK + ' packages with install scripts (lifecycle).');
        mode = 'lifecycle';
        var sel = document.getElementById('viewMode');
        if (sel) sel.value = 'lifecycle';
      } else {
        setHint(
          numNodesWithRoot > THRESH && mode !== 'full'
            ? 'Large project: this view is easier to read. Switch to "Full" for the entire graph.'
            : ''
        );
      }
      const { nodes, extraEdges } = buildElements(mode);
      if (mode === 'lifecycle' && nodes.length <= 1) {
        setHint('No lifecycle packages in graph — showing full graph.');
        if (mode !== 'full') return mount('full');
      }
      const nCount = nodes.length;
      const useZoom = mode === 'full' && nCount > THRESH;
      const layout = pickLayout(mode, nCount);
      cy = cytoscape({
        container: document.getElementById('cy'),
        elements: nodes.concat(extraEdges),
        minZoom: useZoom ? 0.08 : 0.2,
        maxZoom: 2.5,
        wheelSensitivity: mode === 'full' && nCount > 400 ? 0.25 : 0.35,
        style: [
          {
            selector: 'node',
            style: {
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
            },
          },
          {
            selector: 'node[id="root"]',
            style: {
              'text-max-width': 280,
              'font-size': '13px',
            },
          },
          {
            selector: 'edge',
            style: {
              'width': 2,
              'line-color': '#4a5563',
              'target-arrow-color': '#6a737d',
              'target-arrow-shape': 'triangle',
              'arrow-scale': 1.1,
              'curve-style': 'bezier',
            },
          },
        ],
        layout,
      });
      cy.ready(function () {
        var pad = mode === 'full' && nCount <= THRESH ? 64 : 48;
        if (mode === 'full' && nCount > THRESH) pad = 28;
        try {
          cy.fit(cy.elements(), pad);
        } catch (e) {
          try { cy.fit(); } catch (e2) {}
        }
      });
    }

    (function initSelect() {
      if (numNodesWithRoot <= THRESH) {
        var s0 = document.getElementById('viewMode');
        if (s0) s0.value = 'full';
        setHint('');
        mount('full');
      } else if (blastFocusNodeIds.size > 0) {
        setHint('Large project: default is blast-focused. Use the menu to switch view.');
        mount('blast');
      } else if (baseNodes.some(function (n) { return n.hasLifecycle; })) {
        setHint('No blast path to a lockfile node; showing lifecycle packages only. Try Full for the whole graph.');
        var s2 = document.getElementById('viewMode');
        if (s2) s2.value = 'lifecycle';
        mount('lifecycle');
      } else {
        mount('full');
      }
      var sel = document.getElementById('viewMode');
      if (sel) {
        sel.addEventListener('change', function () {
          mount(this.value);
        });
      }
    })();
  </script>
</body>
</html>`;
}

function severityClass(severity: FindingSeverity): string {
  return severity.toLowerCase();
}

function renderFindings(findings: Finding[]): string {
  if (findings.length === 0) {
    return '<p style="color:#8b949e;font-size:.85rem;">No install-time risks found.</p>';
  }

  return findings
    .map(
      (finding) => `
          <div class="finding">
            <div class="finding-row">
              <span class="finding-severity ${severityClass(finding.severity)}">${escapeHtml(finding.severity)}</span>
              <span class="finding-package">${escapeHtml(finding.package)}</span>
            </div>
            <div class="finding-detail">${escapeHtml(finding.detail)}</div>
          </div>
        `
    )
    .join('');
}

function escapeHtml(text: string) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
