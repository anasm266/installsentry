import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface SandboxResult {
  tempDir: string;
  traceFile: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface SandboxOptions {
  projectPath: string;
  packageName?: string;
  scriptName?: string;
}

const SECRET_CANARIES: Record<string, string> = {
  NPM_TOKEN: 'fake_canary_npm_token_7a3f9e2d',
  AWS_ACCESS_KEY_ID: 'fake_canary_aws_key_AKIAIOSFODNN7EXAMPLE',
  AWS_SECRET_ACCESS_KEY: 'fake_canary_aws_secret_wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  GITHUB_TOKEN: 'fake_canary_github_token_ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  SSH_PRIVATE_KEY: `-----BEGIN OPENSSH PRIVATE KEY-----
fake_canary_ssh_key
-----END OPENSSH PRIVATE KEY-----`,
};

export async function runSandboxedInstall(options: SandboxOptions): Promise<SandboxResult> {
  const { projectPath } = options;

  const tempDir = mkdtempSync(join(tmpdir(), 'installsentry-'));
  const traceFile = join(tempDir, 'trace.jsonl');

  // Copy package manifests
  cpSync(resolve(projectPath, 'package.json'), join(tempDir, 'package.json'));
  cpSync(resolve(projectPath, 'package-lock.json'), join(tempDir, 'package-lock.json'));
  // file:../ local packages (e.g. monorepo-style fixtures)
  const packagesDir = resolve(projectPath, 'packages');
  if (existsSync(packagesDir)) {
    cpSync(packagesDir, join(tempDir, 'packages'), { recursive: true });
  }

  // Shim: copy from dist/ next to compiled sandbox.js (not process.cwd, so tests/CLI from any directory work)
  const distDir = dirname(fileURLToPath(import.meta.url));
  const shimSrc = join(distDir, 'shim.cjs');
  const canarySrc = join(distDir, 'canary-substrings.json');
  const shimDest = join(tempDir, 'installsentry-shim.cjs');
  const canaryDest = join(tempDir, 'canary-substrings.json');
  cpSync(shimSrc, shimDest);
  cpSync(canarySrc, canaryDest);

  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    ...SECRET_CANARIES,
    INSTALLSENTRY_TRACE_FILE: traceFile,
    INSTALLSENTRY_PACKAGE_NAME: options.packageName || 'root',
    INSTALLSENTRY_SCRIPT_NAME: options.scriptName || 'install',
    NODE_OPTIONS: `--require ${shimDest}`,
  };

  // Hide real secrets if they exist
  const sensitive = [
    'NPM_TOKEN',
    'NODE_AUTH_TOKEN',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'GITHUB_TOKEN',
    'GH_TOKEN',
    'SSH_PRIVATE_KEY',
    'HOME_SSH_KEY',
  ];
  for (const key of sensitive) {
    if (process.env[key]) {
      env[key] = SECRET_CANARIES[key] || 'fake_canary_hidden';
    }
  }

  return new Promise((resolve, reject) => {
    const proc = spawn('npm', ['install', '--ignore-scripts=false'], {
      cwd: tempDir,
      env,
      shell: true,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (code: number | null) => {
      const result: SandboxResult = {
        tempDir,
        traceFile,
        exitCode: code ?? -1,
        stdout,
        stderr,
      };
      resolve(result);
    });

    proc.on('error', (err: Error) => {
      reject(err);
    });
  });
}

export function cleanupSandbox(tempDir: string) {
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
}
