import { describe, it, expect } from 'vitest';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseJsonUtf8, stripBom } from '../src/json-utf8.js';
import { parseLockfile } from '../src/lockfile.js';
import { buildGraph } from '../src/graph.js';
import { loadInstallsentryConfig } from '../src/config.js';

describe('json-utf8', () => {
  it('stripBom only removes a single leading BOM', () => {
    expect(stripBom('abc')).toBe('abc');
    expect(stripBom('\uFEFF{"a":1}')).toBe('{"a":1}');
  });

  it('parseJsonUtf8 accepts valid JSON with or without BOM', () => {
    expect(parseJsonUtf8('{"x":1}')).toEqual({ x: 1 });
    expect(parseJsonUtf8('\uFEFF{"x":1}')).toEqual({ x: 1 });
  });
});

describe('BOM on project files (Windows / PowerShell)', () => {
  const src = 'tests/fixtures/test-project';

  it('parses lockfile, root and nested package.json with UTF-8 BOM on root files', () => {
    const d = mkdtempSync(join(tmpdir(), 'is-bom-'));
    try {
      cpSync(src, d, { recursive: true });
      for (const name of ['package.json', 'package-lock.json'] as const) {
        const p = join(d, name);
        const text = readFileSync(p, 'utf-8');
        writeFileSync(p, '\uFEFF' + text, 'utf-8');
      }

      const lockfile = parseLockfile(d);
      const graph = buildGraph(d, lockfile);
      expect(graph.nodes.size).toBeGreaterThan(0);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it('loads JSON config with BOM', () => {
    const d = mkdtempSync(join(tmpdir(), 'is-bom-cfg-'));
    try {
      writeFileSync(join(d, 'installsentry.json'), '\uFEFF' + JSON.stringify({ ci: { allowHosts: ['a.example'] } }), 'utf-8');
      const c = loadInstallsentryConfig(d);
      expect(c?.ci?.allowHosts).toEqual(['a.example']);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it('loads YAML config with BOM', () => {
    const d = mkdtempSync(join(tmpdir(), 'is-bom-yml-'));
    try {
      writeFileSync(join(d, '.installsentry.yaml'), '\uFEFF' + 'ci:\n  allowHosts:\n    - b.example\n', 'utf-8');
      const c = loadInstallsentryConfig(d);
      expect(c?.ci?.allowHosts).toEqual(['b.example']);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
});
