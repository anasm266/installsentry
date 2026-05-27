import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseJsonUtf8 } from './json-utf8.js';

export type PackageManagerKind = 'npm' | 'pnpm' | 'yarn';

export interface DetectedPackageManager {
  kind: PackageManagerKind;
  lockfileName: string;
}

const LOCKFILE_PRIORITY: Array<{ kind: PackageManagerKind; file: string }> = [
  { kind: 'pnpm', file: 'pnpm-lock.yaml' },
  { kind: 'yarn', file: 'yarn.lock' },
  { kind: 'npm', file: 'package-lock.json' },
];

export function parsePackageManagerField(
  projectPath: string
): PackageManagerKind | undefined {
  const pkgPath = resolve(projectPath, 'package.json');
  if (!existsSync(pkgPath)) return undefined;
  try {
    const pkg = parseJsonUtf8(readFileSync(pkgPath, 'utf-8')) as {
      packageManager?: string;
    };
    const pm = pkg.packageManager?.split('@')[0]?.trim();
    if (pm === 'npm' || pm === 'pnpm' || pm === 'yarn') return pm;
  } catch {
    /* ignore */
  }
  return undefined;
}

export function detectPackageManager(
  projectPath: string,
  explicit?: string
): DetectedPackageManager {
  if (explicit) {
    const kind = explicit.toLowerCase().trim() as PackageManagerKind;
    if (kind !== 'npm' && kind !== 'pnpm' && kind !== 'yarn') {
      throw new Error(`Unknown package manager: ${explicit}. Use npm, pnpm, or yarn.`);
    }
    const lock = LOCKFILE_PRIORITY.find((x) => x.kind === kind);
    if (!lock || !existsSync(resolve(projectPath, lock.file))) {
      throw new Error(
        `InstallSentry needs ${lock?.file || 'a lockfile'} for --package-manager ${kind}.`
      );
    }
    return { kind, lockfileName: lock.file };
  }

  const fromField = parsePackageManagerField(projectPath);
  if (fromField) {
    const lock = LOCKFILE_PRIORITY.find((x) => x.kind === fromField);
    if (lock && existsSync(resolve(projectPath, lock.file))) {
      return { kind: fromField, lockfileName: lock.file };
    }
  }

  for (const { kind, file } of LOCKFILE_PRIORITY) {
    if (existsSync(resolve(projectPath, file))) {
      return { kind, lockfileName: file };
    }
  }

  if (existsSync(resolve(projectPath, 'package.json'))) {
    const missing = LOCKFILE_PRIORITY.map((x) => x.file).filter(
      (f) => !existsSync(resolve(projectPath, f))
    );
    throw new Error(
      `InstallSentry needs a npm project with package.json and package-lock.json v3.\nMissing: ${missing.includes('package-lock.json') ? 'package-lock.json' : missing.join(', ')}`
    );
  }

  throw new Error(
    'InstallSentry needs package.json and a lockfile (package-lock.json, pnpm-lock.yaml, or yarn.lock).'
  );
}

export function requiredProjectFiles(kind: PackageManagerKind): string[] {
  const base = ['package.json'];
  switch (kind) {
    case 'pnpm':
      return [...base, 'pnpm-lock.yaml'];
    case 'yarn':
      return [...base, 'yarn.lock'];
    default:
      return [...base, 'package-lock.json'];
  }
}
