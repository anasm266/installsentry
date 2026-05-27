import { runSandboxedInstall, type SandboxOptions, type SandboxResult } from './sandbox.js';
import { runDockerInstall } from './docker-runner.js';

export type InstallRunner = 'host' | 'docker';

export type ProjectInstallOptions = SandboxOptions & {
  runner?: InstallRunner;
  dockerImage?: string;
  dockerNetwork?: 'default' | 'none';
};

/** Run install on the host (default) or in Docker. */
export async function runProjectInstall(options: ProjectInstallOptions): Promise<SandboxResult> {
  if (options.runner === 'docker') {
    return runDockerInstall({
      projectPath: options.projectPath,
      packageManager: options.packageManager,
      packageName: options.packageName,
      scriptName: options.scriptName,
      installCommand: options.installCommand,
      dockerImage: options.dockerImage,
      dockerNetwork: options.dockerNetwork,
    });
  }
  return runSandboxedInstall(options);
}
