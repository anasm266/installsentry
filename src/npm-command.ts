export type NpmCommand = 'install' | 'ci';

export function parseNpmCommand(value: string | undefined, fallback: NpmCommand): NpmCommand {
  if (!value) return fallback;
  if (value === 'install' || value === 'ci') return value;
  throw new Error(`Unsupported npm command: ${value}. Expected "install" or "ci".`);
}

export function npmInstallArgs(command: NpmCommand): string[] {
  return [command, '--ignore-scripts=false'];
}
