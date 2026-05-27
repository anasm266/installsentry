import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Lockfile, LockfilePackage, DependencyGraph, GraphNode, GraphEdge } from './types.js';
import { getPackageNameFromPath } from './lockfile/npm.js';
import { parseJsonUtf8 } from './json-utf8.js';

const LIFECYCLE_SCRIPT_NAMES = new Set([
  'preinstall',
  'install',
  'postinstall',
  'prepublish',
  'prepack',
  'postpack',
  'prepublishOnly',
  'preprepare',
  'prepare',
  'postprepare',
]);

function hasLifecycleScripts(scripts?: Record<string, string>): boolean {
  if (!scripts) return false;
  return Object.keys(scripts).some((s) => LIFECYCLE_SCRIPT_NAMES.has(s));
}

function readPackageJsonScripts(projectPath: string, packagePath: string): Record<string, string> | undefined {
  const pkgJsonPath = resolve(projectPath, packagePath, 'package.json');
  if (!existsSync(pkgJsonPath)) return undefined;
  try {
    const content = readFileSync(pkgJsonPath, 'utf-8');
    const pkg = parseJsonUtf8(content) as { scripts?: Record<string, string> };
    return pkg.scripts;
  } catch {
    return undefined;
  }
}

export function buildGraph(projectPath: string, lockfile: Lockfile): DependencyGraph {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];

  for (const [path, pkg] of Object.entries(lockfile.packages)) {
    if (path === '') continue; // skip root

    const name = getPackageNameFromPath(path);
    const scripts = readPackageJsonScripts(projectPath, path);
    const node: GraphNode = {
      id: path,
      name,
      version: pkg.version,
      hasLifecycleScripts: hasLifecycleScripts(scripts),
      scripts,
      resolved: pkg.resolved,
      integrity: pkg.integrity,
    };
    nodes.set(path, node);

    // Determine parent from path structure
    // e.g. "node_modules/a/node_modules/b" -> parent is "node_modules/a"
    if (path !== `node_modules/${name}`) {
      const parts = path.split('/');
      // Remove last "node_modules/<name>"
      parts.pop();
      parts.pop();
      const parentPath = parts.join('/');
      if (parentPath && nodes.has(parentPath)) {
        edges.push({ from: parentPath, to: path });
      } else if (parentPath === '') {
        // direct dependency of root
        edges.push({ from: '', to: path });
      }
    } else {
      // direct dependency
      edges.push({ from: '', to: path });
    }
  }

  return { nodes, edges };
}

/** Map a traced cwd id to a lockfile node id; handles Windows path casing / separators vs lockfile. */
export function resolveGraphNodeId(graph: DependencyGraph, id: string): string | undefined {
  if (graph.nodes.has(id)) return id;
  const lower = id.toLowerCase();
  for (const k of graph.nodes.keys()) {
    if (k.toLowerCase() === lower) return k;
  }
  return undefined;
}

export function findPathsToRoot(graph: DependencyGraph, targetId: string): string[][] {
  const paths: string[][] = [];

  function backtrack(current: string, path: string[]) {
    if (current === '') {
      paths.push([...path].reverse());
      return;
    }
    const parents = graph.edges.filter((e) => e.to === current).map((e) => e.from);
    for (const parent of parents) {
      backtrack(parent, [...path, current]);
    }
  }

  backtrack(targetId, []);
  return paths;
}

export function calculateRiskScore(node: GraphNode): number {
  let score = 0;
  if (node.hasLifecycleScripts) score += 3;
  if (node.scripts?.install) score += 2;
  if (node.scripts?.postinstall) score += 2;
  if (node.scripts?.preinstall) score += 1;
  return score;
}
