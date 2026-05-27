import { describe, expect, it } from 'vitest';
import { buildJsonReport, JSON_REPORT_VERSION } from '../src/output/json.js';
import type { AnalysisResult, DependencyGraph } from '../src/types.js';

describe('json output', () => {
  it('includes schema version and findings', () => {
    const graph: DependencyGraph = { nodes: new Map(), edges: [] };
    const analysis: AnalysisResult = {
      events: [],
      secretHits: [],
      networkRequests: [],
      fileChanges: [],
      lifecycleExecutions: [],
      blastRadiusPaths: [],
    };
    const report = buildJsonReport(
      {
        graph,
        analysis,
        targetPackage: 'app',
        targetVersion: '1.0.0',
      },
      { packageManager: 'npm', installsentryVersion: '2.0.0' }
    );
    expect(report.installsentryReportVersion).toBe(JSON_REPORT_VERSION);
    expect(report.target.name).toBe('app');
    expect(report.packageManager).toBe('npm');
  });
});
