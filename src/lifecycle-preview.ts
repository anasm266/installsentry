import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { DependencyGraph } from './types.js';
import { parseJsonUtf8 } from './json-utf8.js';

export interface LifecycleScriptPreview {
  packageId: string;
  name: string;
  version: string;
  scripts: Array<{ name: string; command: string; source?: string }>;
}

const LIFECYCLE = new Set([
  'preinstall',
  'install',
  'postinstall',
  'prepare',
  'prepack',
  'postpack',
  'prepublishOnly',
]);

export function collectLifecyclePreviews(
  projectPath: string,
  graph: DependencyGraph
): LifecycleScriptPreview[] {
  const out: LifecycleScriptPreview[] = [];

  for (const node of graph.nodes.values()) {
    if (!node.hasLifecycleScripts || !node.scripts) continue;
    const scripts: LifecycleScriptPreview['scripts'] = [];
    for (const [name, command] of Object.entries(node.scripts)) {
      if (!LIFECYCLE.has(name)) continue;
      let source: string | undefined;
      const pkgJson = resolve(projectPath, node.id, 'package.json');
      const localPkg = resolve(projectPath, 'packages', node.name, 'package.json');
      for (const p of [pkgJson, localPkg]) {
        if (!existsSync(p)) continue;
        try {
          const pkg = parseJsonUtf8(readFileSync(p, 'utf-8')) as {
            scripts?: Record<string, string>;
          };
          const rel = pkg.scripts?.[name];
          if (rel && (rel.endsWith('.js') || rel.endsWith('.cjs') || rel.endsWith('.mjs'))) {
            const scriptFile = resolve(dirname(p), rel);
            if (existsSync(scriptFile)) {
              source = readFileSync(scriptFile, 'utf-8').slice(0, 4000);
            }
          }
        } catch {
          /* */
        }
      }
      scripts.push({ name, command, source });
    }
    if (scripts.length) {
      out.push({
        packageId: node.id,
        name: node.name,
        version: node.version,
        scripts,
      });
    }
  }

  return out;
}
