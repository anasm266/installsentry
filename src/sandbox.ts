import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, cpSync, rmSync, writeFileSync } from 'node:fs';
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

export interface PreparedInstallWorkspace {
  tempDir: string;
  traceFile: string;
  shimPath: string;
}

/**
 * Copy lockfile, package.json, local packages, and shim into a temp directory.
 */
export function prepareInstallWorkspace(projectPath: string): PreparedInstallWorkspace {
  const tempDir = mkdtempSync(join(tmpdir(), 'installsentry-'));
  const traceFile = join(tempDir, 'trace.jsonl');

  cpSync(resolve(projectPath, 'package.json'), join(tempDir, 'package.json'));
  cpSync(resolve(projectPath, 'package-lock.json'), join(tempDir, 'package-lock.json'));
  const packagesDir = resolve(projectPath, 'packages');
  if (existsSync(packagesDir)) {
    cpSync(packagesDir, join(tempDir, 'packages'), { recursive: true });
  }

  const distDir = dirname(fileURLToPath(import.meta.url));
  const shimSrc = join(distDir, 'shim.cjs');
  const canarySrc = join(distDir, 'canary-substrings.json');
  const shimPath = join(tempDir, 'installsentry-shim.cjs');
  const canaryDest = join(tempDir, 'canary-substrings.json');
  cpSync(shimSrc, shimPath);
  cpSync(canarySrc, canaryDest);

  return { tempDir, traceFile, shimPath };
}

export function buildInstallEnv(
  p: {
    projectRoot: string;
    traceFile: string;
    shimPath: string;
    packageName: string;
    scriptName: string;
    /** Merge with `process.env` (host). Docker uses `false` and a minimal set. */
    includeProcessEnv: boolean;
  }
): Record<string, string> {
  const base: Record<string, string> = {
    ...SECRET_CANARIES,
    INSTALLSENTRY_TRACE_FILE: p.traceFile,
    INSTALLSENTRY_PACKAGE_NAME: p.packageName,
    INSTALLSENTRY_PROJECT_ROOT: p.projectRoot,
    INSTALLSENTRY_SCRIPT_NAME: p.scriptName,
    NODE_OPTIONS: `--require ${p.shimPath}`,
  };

  const env: Record<string, string> = p.includeProcessEnv
    ? { ...(process.env as Record<string, string>), ...base }
    : { ...base, PATH: process.env.PATH || '', SystemRoot: process.env.SystemRoot || '' };

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
    if (p.includeProcessEnv && process.env[key]) {
      env[key] = SECRET_CANARIES[key] || 'fake_canary_hidden';
    }
  }

  return env;
}

function waitForNpm(
  tempDir: string,
  env: Record<string, string>,
  traceFile: string
): Promise<SandboxResult> {
  return new Promise((resolvePromise, reject) => {
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
      resolvePromise({
        tempDir,
        traceFile,
        exitCode: code ?? -1,
        stdout,
        stderr,
      });
    });
    proc.on('error', (err: Error) => {
      reject(err);
    });
  });
}

/**
 * Default host runner: temp dir + `npm install` on the current machine.
 */
export async function runSandboxedInstall(options: SandboxOptions): Promise<SandboxResult> {
  const { tempDir, traceFile, shimPath } = prepareInstallWorkspace(options.projectPath);
  const env = buildInstallEnv({
    projectRoot: tempDir,
    traceFile,
    shimPath,
    packageName: options.packageName || 'root',
    scriptName: options.scriptName || 'install',
    includeProcessEnv: true,
  });
  return waitForNpm(tempDir, env, traceFile);
}

export function cleanupSandbox(tempDir: string) {
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

export { SECRET_CANARIES };
