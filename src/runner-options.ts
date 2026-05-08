import type { InstallRunner } from './install-runner.js';

export interface RunnerSelectionOptions {
  docker?: boolean;
  runner?: string;
}

export function resolveInstallRunner(options: RunnerSelectionOptions): InstallRunner {
  return options.docker || options.runner === 'docker' ? 'docker' : 'host';
}
