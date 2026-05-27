import type { PackageManagerKind } from '../package-manager.js';
import type { LockfileAdapter } from './types.js';
import { npmLockfileAdapter } from './npm.js';
import { pnpmLockfileAdapter } from './pnpm.js';
import { yarnLockfileAdapter } from './yarn.js';

const ADAPTERS: Record<PackageManagerKind, LockfileAdapter> = {
  npm: npmLockfileAdapter,
  pnpm: pnpmLockfileAdapter,
  yarn: yarnLockfileAdapter,
};

export function getLockfileAdapter(kind: PackageManagerKind): LockfileAdapter {
  return ADAPTERS[kind];
}

export { parseNpmLockfile, getPackageNameFromPath, iterPackages } from './npm.js';
export type { LockfileAdapter } from './types.js';
