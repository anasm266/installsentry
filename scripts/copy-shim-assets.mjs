import { copyFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
mkdirSync(dist, { recursive: true });
for (const name of ['shim.cjs', 'canary-substrings.json']) {
  copyFileSync(join(root, 'src', name), join(dist, name));
}
