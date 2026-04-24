#!/usr/bin/env node

import { Command } from 'commander';
import { resolve } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { parseLockfile } from './lockfile.js';
import { buildGraph } from './graph.js';
import { runProjectInstall, type InstallRunner } from './install-runner.js';
import { cleanupSandbox } from './sandbox.js';
import { readTrace } from './tracer.js';
import { analyzeTrace } from './analyzer.js';
import { generateReport } from './report.js';
import { loadInstallsentryConfig } from './config.js';
import { parseJsonUtf8 } from './json-utf8.js';
import { mergeNetworkPolicy, ciShouldFail } from './network-policy.js';
import { writeSarifToFile } from './sarif.js';

const program = new Command();

program
  .name('installsentry')
  .description('Supply-chain blast-radius visualizer for npm installs')
  .version('0.1.1');

program
  .command('scan')
  .description('Scan package-lock.json for packages with lifecycle scripts')
  .argument('<path>', 'Path to project directory containing package-lock.json')
  .action((projectPath: string) => {
    const fullPath = resolve(projectPath);
    const lockfile = parseLockfile(fullPath);
    const graph = buildGraph(fullPath, lockfile);

    const risky = Array.from(graph.nodes.values()).filter((n) => n.hasLifecycleScripts);
    console.log(
      `Found ${risky.length} packages with lifecycle scripts out of ${graph.nodes.size} total dependencies.`
    );
    for (const pkg of risky) {
      console.log(`  ${pkg.name}@${pkg.version} (${pkg.id})`);
      if (pkg.scripts) {
        for (const [name, script] of Object.entries(pkg.scripts)) {
          console.log(`    - ${name}: ${script}`);
        }
      }
    }
  });

program
  .command('run')
  .description('Run sandboxed install and generate blast-radius report')
  .argument('<path>', 'Path to project directory')
  .option('-o, --output <file>', 'Output HTML report path', 'installsentry-report.html')
  .option('--ci', 'Exit with non-zero if policy violation (secrets, or disallowed network)')
  .option(
    '--allow-hosts <list>',
    'CI: comma-separated host names allowed to receive traffic (enables allowlist; registry-only CI)'
  )
  .option('--deny-hosts <list>', 'CI: hosts that always fail when contacted (in addition to policy rules)')
  .option('--sarif <file>', 'Write SARIF 2.1.0 results to this file (in addition to HTML)')
  .option('--runner <name>', 'host or docker', 'host')
  .option('--docker-image <name>', 'Image when --runner docker (default: node:20-bookworm-slim)', '')
  .action(
    async (
      projectPath: string,
      options: {
        output: string;
        ci?: boolean;
        allowHosts?: string;
        denyHosts?: string;
        sarif?: string;
        runner: string;
        dockerImage: string;
      }
    ) => {
      const fullPath = resolve(projectPath);
      const rootPkg = parseJsonUtf8(
        readFileSync(resolve(fullPath, 'package.json'), 'utf-8')
      ) as {
        name?: string;
        version?: string;
      };
      const config = loadInstallsentryConfig(fullPath);
      const networkPolicy = mergeNetworkPolicy(
        config,
        options.allowHosts,
        options.denyHosts
      );
      const runner: InstallRunner = options.runner === 'docker' ? 'docker' : 'host';
      const dockerImage = options.dockerImage?.trim() || undefined;

      console.log('Parsing lockfile...');
      const lockfile = parseLockfile(fullPath);
      const graph = buildGraph(fullPath, lockfile);

      const runnerLabel = runner === 'docker' ? 'Docker' : 'host';
      console.log(`Running ${runnerLabel} sandboxed npm install...`);
      const sandbox = await runProjectInstall({
        projectPath: fullPath,
        runner,
        dockerImage,
      });
      console.log(`npm install exited with code ${sandbox.exitCode}`);
      if (sandbox.exitCode !== 0) {
        console.error('STDERR:', sandbox.stderr.slice(0, 2000));
      }

      console.log('Reading trace...');
      const events = existsSync(sandbox.traceFile) ? readTrace(sandbox.traceFile) : [];
      console.log(`Collected ${events.length} trace events`);

      console.log('Analyzing...');
      const analysis = analyzeTrace(events, graph);

      const out = resolve(options.output);
      console.log('Generating report...');
      generateReport(
        {
          graph,
          analysis,
          targetPackage: rootPkg.name || 'unknown',
          targetVersion: rootPkg.version || '0.0.0',
        },
        out
      );
      console.log(`Report written to ${out}`);

      if (options.sarif) {
        const sarifPath = resolve(options.sarif);
        writeSarifToFile(sarifPath, analysis, fullPath, { networkPolicy });
        console.log(`SARIF written to ${sarifPath}`);
      }

      cleanupSandbox(sandbox.tempDir);

      if (options.ci) {
        const failed = ciShouldFail(analysis, networkPolicy);
        if (failed) {
          console.error(
            'CI gate FAILED: policy violation (secret canaries, or disallowed network under current policy).'
          );
          process.exit(1);
        }
        console.log('CI gate passed.');
      }
    }
  );

program.parse();
