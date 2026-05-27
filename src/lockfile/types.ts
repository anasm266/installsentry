import type { DependencyGraph, Lockfile } from '../types.js';
import type { PackageManagerKind } from '../package-manager.js';

export interface LockfileAdapter {
  kind: PackageManagerKind;
  parse(projectPath: string): Lockfile;
  buildGraph(projectPath: string, lockfile: Lockfile): DependencyGraph;
}
