import type { PackageManagerKind } from './package-manager.js';
import { npmInstallArgs, parseNpmCommand, type NpmCommand } from './npm-command.js';

export type InstallCommand = NpmCommand;

export function parseInstallCommand(
  value: string | undefined,
  fallback: InstallCommand
): InstallCommand {
  return parseNpmCommand(value, fallback);
}

export function installArgs(kind: PackageManagerKind, command: InstallCommand): string[] {
  switch (kind) {
    case 'pnpm':
      return command === 'ci' ? ['install', '--frozen-lockfile'] : ['install'];
    case 'yarn':
      return command === 'ci' ? ['install', '--immutable'] : ['install'];
    default:
      return npmInstallArgs(command);
  }
}

export function installBinary(kind: PackageManagerKind): string {
  return kind;
}
