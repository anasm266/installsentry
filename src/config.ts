import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { parseJsonUtf8, stripBom } from './json-utf8.js';

export interface InstallsentryConfig {
  /** Network policy; see README */
  ci?: {
    allowHosts?: string[];
    denyHosts?: string[];
  };
}

const CONFIG_NAMES = ['.installsentry.yaml', '.installsentry.yml', 'installsentry.json', '.installsentry.json'] as const;

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
