import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AnalysisResult } from './types.js';
import { getNetworkFindingsForCi, type ResolvedNetworkPolicy } from './network-policy.js';

const TOOL_NAME = 'InstallSentry';
const TOOL_VERSION = '0.1.0';
const R_SECRET = 'installsentry/secret-canary';
const R_NETWORK = 'installsentry/network-egress';

const RULES: Array<{
  id: string;
  name: string;
  shortDescription: { text: string };
  helpUri?: string;
}> = [
  {
    id: R_SECRET,
    name: 'SecretCanaryExfil',
    shortDescription: { text: 'Canary substring read from a file or embedded in a URL (simulated exfiltration).' },
  },
  {
    id: R_NETWORK,
    name: 'NetworkEgress',
    shortDescription: { text: 'Outbound HTTP(S) during install, not permitted by the active network policy (if any).' },
  },
];

/**
 * Build SARIF 2.1.0 document for the analysis and CI-relevant network subset.
 */
export function buildSarif(
  analysis: AnalysisResult,
  projectRoot: string,
  options: { networkPolicy: ResolvedNetworkPolicy }
): object {
  const results: object[] = [];
  for (const h of analysis.secretHits) {
    results.push({
      ruleId: R_SECRET,
      level: 'error',
      message: { text: `Secret canary "${h.canary}" (${h.filePath}) from package ${h.package}` },
      locations: [physicalLocationForPath(h.filePath, projectRoot)],
    });
  }
  const networkViolations = getNetworkFindingsForCi(analysis.networkRequests, options.networkPolicy);
  for (const n of networkViolations) {
    results.push({
      ruleId: R_NETWORK,
      level: 'error',
      message: { text: `Network: ${n.method} ${n.host} (${n.url}) from package ${n.package}` },
      locations: [physicalLocationForUri(n.url, projectRoot)],
    });
  }

  return {
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
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

function physicalLocationForPath(path: string, projectRoot: string): { physicalLocation: object } {
  if (/^https?:\/\//i.test(path) || !path) {
    return { physicalLocation: { address: { kind: 'uri' as const, uri: path } } } as { physicalLocation: object };
  }
  return {
    physicalLocation: {
      artifactLocation: { uri: path, uriBaseId: '%SRCROOT%' },
    },
  };
}

function physicalLocationForUri(_url: string, projectRoot: string): { physicalLocation: object } {
  return {
    physicalLocation: { artifactLocation: { uri: projectRoot.replace(/\\/g, '/') + '/(install-trace)' } },
  };
}

export function writeSarifToFile(
  outPath: string,
  analysis: AnalysisResult,
  projectRoot: string,
  options: { networkPolicy: ResolvedNetworkPolicy }
) {
  const doc = buildSarif(analysis, projectRoot, options);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(doc, null, 2), 'utf-8');
}
