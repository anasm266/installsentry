import { spawn } from 'node:child_process';
import { unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { prepareInstallWorkspace, buildInstallEnv, type SandboxResult, type SandboxOptions } from './sandbox.js';
import { installArgs, installBinary } from './install-command.js';

const DEFAULT_IMAGE = 'node:20-bookworm-slim';

export type DockerRunOptions = SandboxOptions & {
  dockerImage?: string;
  dockerNetwork?: 'default' | 'none';
};

function dockerAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const p = spawn('docker', ['version'], { stdio: 'ignore' });
    p.on('error', () => resolve(false));
    p.on('close', (code) => resolve(code === 0));
  });
}

export async function runDockerInstall(options: DockerRunOptions): Promise<SandboxResult> {
  if (!(await dockerAvailable())) {
    throw new Error(
      'Docker is not available on PATH. Install Docker Desktop (Windows/macOS) or docker.io (Linux), or use the default host runner.'
    );
  }

  const pm = options.packageManager;
  const { tempDir, traceFile, shimPath } = prepareInstallWorkspace(options.projectPath, pm);
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
  const installCommand = options.installCommand || 'install';
  const binary = installBinary(pm);
  const args: string[] = [
    'run',
    '--rm',
    '--env-file',
    envFile,
    '-v',
    `${tempDir}:/project`,
    '-w',
    '/project',
  ];
  if (options.dockerNetwork === 'none') {
    args.push('--network', 'none');
  }
  args.push(image, binary, ...installArgs(pm, installCommand));

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
