import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createRequire } from 'node:module';
import type { AnalysisResult, DependencyGraph } from './types.js';
import { getNetworkFindingsForCi, type ResolvedNetworkPolicy } from './network-policy.js';
import { findPathsToRoot } from './graph.js';
import { resolveGraphNodeId } from './graph.js';

const require = createRequire(import.meta.url);
const { version: TOOL_VERSION } = require('../package.json') as { version: string };

const TOOL_NAME = 'InstallSentry';
const THREAT_MODEL =
  'https://github.com/anasm266/installsentry/blob/master/docs/THREAT-MODEL.md';
const R_SECRET = 'installsentry/secret-canary';
const R_NETWORK = 'installsentry/network-egress';

const RULES: Array<{
  id: string;
  name: string;
  shortDescription: { text: string };
  helpUri: string;
}> = [
  {
    id: R_SECRET,
    name: 'SecretCanaryExfil',
    shortDescription: {
      text: 'Canary substring read from a file or embedded in a URL (simulated exfiltration).',
    },
    helpUri: `${THREAT_MODEL}#what-the-tool-is-designed-to-surface`,
  },
  {
    id: R_NETWORK,
    name: 'NetworkEgress',
    shortDescription: {
      text: 'Outbound HTTP(S) during install, not permitted by the active network policy.',
    },
    helpUri: `${THREAT_MODEL}#out-of-scope-and-known-blind-spots`,
  },
];

export function buildSarif(
  analysis: AnalysisResult,
  projectRoot: string,
  options: { networkPolicy: ResolvedNetworkPolicy; graph?: DependencyGraph }
): object {
  const results: object[] = [];
  for (const h of analysis.secretHits) {
    const related = relatedLocationsForPackage(options.graph, h.package, projectRoot);
    results.push({
      ruleId: R_SECRET,
      level: 'error',
      message: { text: `Secret canary "${h.canary}" (${h.filePath}) from package ${h.package}` },
      locations: [physicalLocationForPath(h.filePath, projectRoot)],
      relatedLocations: related,
    });
  }
  const networkViolations = getNetworkFindingsForCi(
    analysis.networkRequests,
    options.networkPolicy
  );
  for (const n of networkViolations) {
    results.push({
      ruleId: R_NETWORK,
      level: 'warning',
      message: { text: `Network: ${n.method} ${n.host} (${n.url}) from package ${n.package}` },
      locations: [physicalLocationForUri(n.url, projectRoot)],
      relatedLocations: relatedLocationsForPackage(options.graph, n.package, projectRoot),
    });
  }

  return {
    $schema:
      'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: TOOL_NAME,
            version: TOOL_VERSION,
            informationUri: 'https://github.com/anasm266/installsentry',
            rules: RULES,
            language: 'en',
          },
        },
        invocations: [
          {
            executionSuccessful: true,
            endTimeUtc: new Date().toISOString(),
          },
        ],
        results,
      },
    ],
  };
}

function relatedLocationsForPackage(
  graph: DependencyGraph | undefined,
  packageId: string,
  projectRoot: string
): object[] | undefined {
  if (!graph) return undefined;
  const graphId = resolveGraphNodeId(graph, packageId);
  if (!graphId) return undefined;
  const paths = findPathsToRoot(graph, graphId);
  if (!paths.length) return undefined;
  return paths[0].map((nodeId) => ({
    physicalLocation: {
      artifactLocation: {
        uri: nodeId || projectRoot,
        uriBaseId: '%SRCROOT%',
      },
    },
  }));
}

function physicalLocationForPath(path: string, _projectRoot: string): { physicalLocation: object } {
  if (/^https?:\/\//i.test(path) || !path) {
    return { physicalLocation: { address: { kind: 'uri' as const, uri: path } } };
  }
  return {
    physicalLocation: {
      artifactLocation: { uri: path, uriBaseId: '%SRCROOT%' },
    },
  };
}

function physicalLocationForUri(_url: string, projectRoot: string): { physicalLocation: object } {
  return {
    physicalLocation: {
      artifactLocation: { uri: projectRoot.replace(/\\/g, '/') + '/(install-trace)' },
    },
  };
}

export function writeSarifToFile(
  outPath: string,
  analysis: AnalysisResult,
  projectRoot: string,
  options: { networkPolicy: ResolvedNetworkPolicy; graph?: DependencyGraph }
) {
  const doc = buildSarif(analysis, projectRoot, options);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(doc, null, 2), 'utf-8');
}
