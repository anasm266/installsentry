import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
try {
  rmSync(dist, { recursive: true, force: true });
} catch {
  // ignore
}
