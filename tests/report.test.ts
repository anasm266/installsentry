import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLockfile } from '../src/lockfile.js';
import { buildGraph } from '../src/graph.js';
import { generateReport } from '../src/report.js';
import type { AnalysisResult } from '../src/types.js';

const malwareFixture = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'malware-demo');

function emptyAnalysis(): AnalysisResult {
  return {
    events: [],
    secretHits: [],
    networkRequests: [],
    fileChanges: [],
    lifecycleExecutions: [],
    blastRadiusPaths: [],
  };
}

describe('report', () => {
  it('renders severity-sorted findings and header severity counts', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'installsentry-report-test-'));
    const reportPath = join(tempDir, 'report.html');
    const lock = parseLockfile(malwareFixture);
    const graph = buildGraph(malwareFixture, lock);
    const analysis = emptyAnalysis();
    analysis.secretHits = [
      {
        canary: 'fake_canary_aws_secret',
        package: 'packages/malice-local',
        filePath: 'https://example.com/?exfil=fake_canary_aws_secret',
        timestamp: 0,
      },
    ];
    analysis.networkRequests = [
      {
        package: 'packages/malice-local',
        host: 'example.com',
        method: 'GET',
        url: 'https://example.com/?exfil=fake_canary_aws_secret',
        timestamp: 0,
      },
      {
        package: 'install-root',
        host: 'registry.npmjs.org',
        method: 'POST',
        url: 'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk',
        timestamp: 0,
      },
    ];

    try {
      generateReport(
        {
          graph,
          analysis,
          targetPackage: 'demo',
          targetVersion: '1.0.0',
        },
        reportPath
      );
      const html = readFileSync(reportPath, 'utf-8');

      expect(html).toContain('<h3>Findings</h3>');
      expect(html).toContain('1 critical');
      expect(html).toContain('0 high');
      expect(html).toContain('2 medium');
      expect(html).toContain('CRITICAL');
      expect(html).toContain('packages/malice-local');
      expect(html).toContain('sent fake AWS secret canary to example.com');
      expect(html).toContain('made POST request to registry.npmjs.org');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
