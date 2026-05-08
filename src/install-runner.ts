import { runSandboxedInstall, type SandboxOptions, type SandboxResult } from './sandbox.js';
import { runDockerInstall } from './docker-runner.js';

export type InstallRunner = 'host' | 'docker';

/** Run install on the host (default) or in Docker; see `docker-runner.ts`. */
export async function runProjectInstall(
  options: SandboxOptions & { runner?: InstallRunner; dockerImage?: string }
): Promise<SandboxResult> {
  if (options.runner === 'docker') {
    return runDockerInstall({
      projectPath: options.projectPath,
      packageName: options.packageName,
      scriptName: options.scriptName,
      npmCommand: options.npmCommand,
      dockerImage: options.dockerImage,
    });
  }
  return runSandboxedInstall(options);
}
