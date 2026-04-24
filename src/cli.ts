#!/usr/bin/env node

import { Command } from 'commander';
import { resolve } from 'node:path';
import { parseLockfile } from './lockfile.js';
import { buildGraph } from './graph.js';
import { runSandboxedInstall, cleanupSandbox } from './sandbox.js';
import { readTrace } from './tracer.js';
import { analyzeTrace } from './analyzer.js';
import { generateReport } from './report.js';
import { readFileSync, existsSync } from 'node:fs';

const program = new Command();

program
  .name('installsentry')
  .description('Supply-chain blast-radius visualizer for npm installs')
  .version('0.1.0');

program
  .command('scan')
  .description('Scan package-lock.json for packages with lifecycle scripts')
  .argument('<path>', 'Path to project directory containing package-lock.json')
  .action((projectPath: string) => {
    const fullPath = resolve(projectPath);
    const lockfile = parseLockfile(fullPath);
    const graph = buildGraph(fullPath, lockfile);

    const risky = Array.from(graph.nodes.values()).filter((n) => n.hasLifecycleScripts);
    console.log(`Found ${risky.length} packages with lifecycle scripts out of ${graph.nodes.size} total dependencies.`);
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
  .option('--ci', 'Exit with non-zero if secrets are touched or unauthorized network calls are made')
  .action(async (projectPath: string, options: { output: string; ci?: boolean }) => {
    const fullPath = resolve(projectPath);

    // Read root package info
    const rootPkg = JSON.parse(readFileSync(resolve(fullPath, 'package.json'), 'utf-8')) as {
      name?: string;
      version?: string;
    };

    console.log('Parsing lockfile...');
    const lockfile = parseLockfile(fullPath);
    const graph = buildGraph(fullPath, lockfile);

    console.log('Running sandboxed npm install...');
    const sandbox = await runSandboxedInstall({ projectPath: fullPath });
    console.log(`npm install exited with code ${sandbox.exitCode}`);
    if (sandbox.exitCode !== 0) {
      console.error('STDERR:', sandbox.stderr.slice(0, 2000));
    }

    console.log('Reading trace...');
    const events = existsSync(sandbox.traceFile) ? readTrace(sandbox.traceFile) : [];
    console.log(`Collected ${events.length} trace events`);

    console.log('Analyzing...');
    const analysis = analyzeTrace(events, graph);

    console.log('Generating report...');
    generateReport(
      {
        graph,
        analysis,
        targetPackage: rootPkg.name || 'unknown',
        targetVersion: rootPkg.version || '0.0.0',
      },
      resolve(options.output)
    );

    console.log(`Report written to ${resolve(options.output)}`);

    // Cleanup
    cleanupSandbox(sandbox.tempDir);

    if (options.ci) {
      const failed = analysis.secretHits.length > 0 || analysis.networkRequests.length > 0;
      if (failed) {
        console.error('CI gate FAILED: secrets touched or network egress detected during install.');
        process.exit(1);
      }
      console.log('CI gate passed.');
    }
  });

program.parse();
