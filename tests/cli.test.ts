import { describe, it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = join(repoRoot, 'dist', 'cli.js');
const malwareDemoFixture = join(repoRoot, 'tests', 'fixtures', 'malware-demo');

interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runCli(args: string[], cwd: string): Promise<CliResult> {
  return new Promise((resolve) => {
    execFile(process.execPath, [cliPath, ...args], { cwd }, (error, stdout, stderr) => {
      resolve({
        code: typeof error?.code === 'number' ? error.code : 0,
        stdout,
        stderr,
      });
    });
  });
}

describe('cli defaults', () => {
  it('scan defaults to the current working directory', async () => {
    const result = await runCli(['scan'], malwareDemoFixture);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Found 1 packages with lifecycle scripts');
    expect(result.stdout).toContain('malice-local@1.0.0');
  });

  it(
    'runs the current working directory when no subcommand is provided',
    async () => {
      const tempRoot = mkdtempSync(join(tmpdir(), 'installsentry-cli-'));
      const projectPath = join(tempRoot, 'project');
      const reportPath = join(tempRoot, 'report.html');
      cpSync(malwareDemoFixture, projectPath, { recursive: true });

      try {
        const result = await runCli(['-o', reportPath], projectPath);

        expect(result.code).toBe(0);
        expect(result.stdout).toContain('Parsing lockfile');
        expect(result.stdout).toContain(`Report written to ${reportPath}`);
        expect(existsSync(reportPath)).toBe(true);
      } finally {
        rmSync(tempRoot, { recursive: true, force: true });
      }
    },
    120_000
  );

  it('prints a clear error when the current directory is not a supported npm project', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'installsentry-cli-invalid-'));
    writeFileSync(join(tempRoot, 'package.json'), '{"name":"invalid-fixture"}\n', 'utf-8');

    try {
      const result = await runCli(['scan'], tempRoot);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain(
        'InstallSentry needs an npm project with package.json and package-lock.json v3.'
      );
      expect(result.stderr).toContain('Missing: package-lock.json');
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
