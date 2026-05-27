import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PackageManagerKind } from './package-manager.js';
import { installArgs, installBinary } from './install-command.js';
import type { InstallCommand } from './install-command.js';

export interface SandboxResult {
  tempDir: string;
  traceFile: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface SandboxOptions {
  projectPath: string;
  packageManager: PackageManagerKind;
  packageName?: string;
  scriptName?: string;
  installCommand?: InstallCommand;
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

function copyIfExists(src: string, dest: string): void {
  if (existsSync(src)) cpSync(src, dest);
}

/**
 * Copy project manifests, lockfiles, workspaces, and shim into a temp directory.
 */
export function prepareInstallWorkspace(
  projectPath: string,
  packageManager: PackageManagerKind
): PreparedInstallWorkspace {
  const tempDir = mkdtempSync(join(tmpdir(), 'installsentry-'));
  const traceFile = join(tempDir, 'trace.jsonl');

  cpSync(resolve(projectPath, 'package.json'), join(tempDir, 'package.json'));

  switch (packageManager) {
    case 'pnpm':
      copyIfExists(resolve(projectPath, 'pnpm-lock.yaml'), join(tempDir, 'pnpm-lock.yaml'));
      copyIfExists(resolve(projectPath, 'pnpm-workspace.yaml'), join(tempDir, 'pnpm-workspace.yaml'));
      break;
    case 'yarn':
      copyIfExists(resolve(projectPath, 'yarn.lock'), join(tempDir, 'yarn.lock'));
      copyIfExists(resolve(projectPath, '.yarnrc.yml'), join(tempDir, '.yarnrc.yml'));
      break;
    default:
      cpSync(resolve(projectPath, 'package-lock.json'), join(tempDir, 'package-lock.json'));
  }

  const packagesDir = resolve(projectPath, 'packages');
  if (existsSync(packagesDir)) {
    cpSync(packagesDir, join(tempDir, 'packages'), { recursive: true });
  }

  const distDir = dirname(fileURLToPath(import.meta.url));
  const shimSrc = join(distDir, 'shim.cjs');
  const canarySrc = join(distDir, 'canary-substrings.json');
  const shimPath = join(tempDir, 'installsentry-shim.cjs');
  cpSync(shimSrc, shimPath);
  cpSync(canarySrc, join(tempDir, 'canary-substrings.json'));

  return { tempDir, traceFile, shimPath };
}

export function buildInstallEnv(p: {
  projectRoot: string;
  traceFile: string;
  shimPath: string;
  packageName: string;
  scriptName: string;
  includeProcessEnv: boolean;
}): Record<string, string> {
  const base: Record<string, string> = {
    ...SECRET_CANARIES,
    INSTALLSENTRY_TRACE_FILE: p.traceFile,
    INSTALLSENTRY_PACKAGE_NAME: p.packageName,
    INSTALLSENTRY_PROJECT_ROOT: p.projectRoot,
    INSTALLSENTRY_SCRIPT_NAME: p.scriptName,
    INSTALLSENTRY_SHIM_PATH: p.shimPath,
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

function waitForInstall(
  tempDir: string,
  env: Record<string, string>,
  traceFile: string,
  packageManager: PackageManagerKind,
  installCommand: InstallCommand
): Promise<SandboxResult> {
  const binary = installBinary(packageManager);
  const args = installArgs(packageManager, installCommand);

  return new Promise((resolvePromise, reject) => {
    const proc = spawn(binary, args, {
      cwd: tempDir,
      env,
      shell: packageManager === 'npm',
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

export async function runSandboxedInstall(options: SandboxOptions): Promise<SandboxResult> {
  const pm = options.packageManager;
  const { tempDir, traceFile, shimPath } = prepareInstallWorkspace(options.projectPath, pm);
  const installCommand = options.installCommand || 'install';
  const env = buildInstallEnv({
    projectRoot: tempDir,
    traceFile,
    shimPath,
    packageName: options.packageName || 'root',
    scriptName: options.scriptName || installCommand,
    includeProcessEnv: true,
  });
  return waitForInstall(tempDir, env, traceFile, pm, installCommand);
}

export function cleanupSandbox(tempDir: string) {
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

export { SECRET_CANARIES };
