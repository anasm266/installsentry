import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const testProject = join(root, 'tests', 'fixtures', 'test-project');
if (!existsSync(join(testProject, 'node_modules', 'esbuild', 'package.json'))) {
  const r = spawnSync('npm', ['ci'], { cwd: testProject, stdio: 'inherit', shell: true, env: process.env });
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
}
