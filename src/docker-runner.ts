import { spawn } from 'node:child_process';
import { unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { prepareInstallWorkspace, buildInstallEnv, type SandboxResult, type SandboxOptions } from './sandbox.js';

const DEFAULT_IMAGE = 'node:20-bookworm-slim';

export type DockerRunOptions = SandboxOptions & { dockerImage?: string };

/**
 * Run `npm install` inside a container with the project temp dir mounted at `/project`.
 * Requires Docker on `PATH`. Best supported on Linux CI; on Windows, Docker Desktop path sharing must allow the temp drive.
 */
export async function runDockerInstall(options: DockerRunOptions): Promise<SandboxResult> {
  const { tempDir, traceFile, shimPath } = prepareInstallWorkspace(options.projectPath);
  const env = buildInstallEnv({
    projectRoot: '/project',
    traceFile: '/project/trace.jsonl',
    shimPath: '/project/installsentry-shim.cjs',
    packageName: options.packageName || 'root',
    scriptName: options.scriptName || 'install',
    includeProcessEnv: false,
  });

  const envFile = join(tempDir, 'docker.env');
  const lines = Object.entries(env).map(([k, v]) => {
    const oneLine = v.replace(/\r?\n/g, ' ').replace(/"/g, '\\"');
    return `${k}="${oneLine}"`;
  });
  writeFileSync(envFile, lines.join('\n'), { encoding: 'utf-8' });

  const image = options.dockerImage || DEFAULT_IMAGE;
  const args: string[] = [
    'run',
    '--rm',
    '--env-file',
    envFile,
    '-v',
    `${tempDir}:/project`,
    '-w',
    '/project',
    image,
    'npm',
    'install',
    '--ignore-scripts=false',
  ];

  return new Promise((resolvePromise, reject) => {
    const p = spawn('docker', args, { stdio: 'pipe' });
    let stdout = '';
    let stderr = '';
    p.stdout?.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    p.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString();
    });
    p.on('close', (code) => {
      try {
        unlinkSync(envFile);
      } catch {
        /* */
      }
      resolvePromise({
        tempDir,
        traceFile,
        exitCode: code ?? -1,
        stdout,
        stderr,
      });
    });
    p.on('error', (err) => {
      try {
        unlinkSync(envFile);
      } catch {
        /* */
      }
      reject(err);
    });
  });
}
