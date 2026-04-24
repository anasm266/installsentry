import { describe, it, expect } from 'vitest';
import { parseLockfile } from '../src/lockfile.js';
import { buildGraph, findPathsToRoot } from '../src/graph.js';

describe('lockfile parser', () => {
  it('parses a valid v3 lockfile', () => {
    const lockfile = parseLockfile('tests/fixtures/test-project');
    expect(lockfile.lockfileVersion).toBe(3);
    expect(lockfile.packages['node_modules/esbuild']).toBeDefined();
  });

  it('throws on missing lockfile', () => {
    expect(() => parseLockfile('tests/fixtures/nonexistent')).toThrow();
  });
});

describe('graph builder', () => {
  it('builds a graph with nodes and edges', () => {
    const lockfile = parseLockfile('tests/fixtures/test-project');
    const graph = buildGraph('tests/fixtures/test-project', lockfile);
    expect(graph.nodes.size).toBeGreaterThan(0);
    expect(graph.edges.length).toBeGreaterThan(0);
  });

  it('detects lifecycle scripts on esbuild', () => {
    const lockfile = parseLockfile('tests/fixtures/test-project');
    const graph = buildGraph('tests/fixtures/test-project', lockfile);
    const esbuild = graph.nodes.get('node_modules/esbuild');
    expect(esbuild).toBeDefined();
    expect(esbuild!.hasLifecycleScripts).toBe(true);
  });

  it('finds paths to root', () => {
    const lockfile = parseLockfile('tests/fixtures/test-project');
    const graph = buildGraph('tests/fixtures/test-project', lockfile);
    const paths = findPathsToRoot(graph, 'node_modules/esbuild');
    expect(paths.length).toBeGreaterThan(0);
  });
});
