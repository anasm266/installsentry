import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { parseJsonUtf8, stripBom } from './json-utf8.js';
import type { CiPolicyMode } from './policy.js';
import type { FailOnRule } from './policy.js';

export type ReportFormat = 'html' | 'json' | 'both';

export interface InstallsentryConfig {
  version?: number;
  ci?: {
    policy?: CiPolicyMode;
    allowHosts?: string[];
    denyHosts?: string[];
    failOn?: FailOnRule[];
  };
  runner?: {
    mode?: 'host' | 'docker';
    dockerImage?: string;
    dockerNetwork?: 'default' | 'none';
  };
  report?: {
    output?: string;
    format?: ReportFormat;
    sarif?: string;
  };
  baseline?: {
    path?: string;
  };
}

const CONFIG_NAMES = [
  '.installsentry.yaml',
  '.installsentry.yml',
  'installsentry.json',
  '.installsentry.json',
] as const;

/**
 * Load optional project-level config. First matching filename wins.
 */
export function loadInstallsentryConfig(projectPath: string): InstallsentryConfig | null {
  for (const name of CONFIG_NAMES) {
    const f = join(projectPath, name);
    if (!existsSync(f)) continue;
    const raw = readFileSync(f, 'utf-8');
    if (name.endsWith('.json')) {
      return parseJsonUtf8<InstallsentryConfig>(raw);
    }
    return (parseYaml(stripBom(raw)) || {}) as InstallsentryConfig;
  }
  return null;
}

export function splitHostList(s: string | undefined): string[] {
  if (!s || !s.trim()) return [];
  return s
    .split(/[,;]\s*|\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function defaultBaselinePath(config: InstallsentryConfig | null): string {
  return config?.baseline?.path || '.installsentry/baseline.json';
}
