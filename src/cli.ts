#!/usr/bin/env node

import { Command } from 'commander';
import { join, resolve } from 'node:path';
import { readFileSync, existsSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { parseLockfile } from './lockfile.js';
import { buildGraph } from './graph.js';
import { runProjectInstall, type InstallRunner } from './install-runner.js';
import { cleanupSandbox } from './sandbox.js';
import { readTrace } from './tracer.js';
import { analyzeTrace } from './analyzer.js';
import { generateReport } from './report.js';
import { loadInstallsentryConfig } from './config.js';
import { parseJsonUtf8 } from './json-utf8.js';
import {
  mergeNetworkPolicy,
  ciShouldFail,
  getNetworkFindingsForCi,
  type ResolvedNetworkPolicy,
} from './network-policy.js';
import { writeSarifToFile } from './sarif.js';
import { displayPackageIdForReport } from './attribution.js';
import type { AnalysisResult, DependencyGraph } from './types.js';
import { createDemoProject } from './demo.js';
import { resolveInstallRunner } from './runner-options.js';
import { parseNpmCommand, type NpmCommand } from './npm-command.js';
import { buildFindings } from './findings.js';

const program = new Command();
program.enablePositionalOptions();

interface RunOptions {
  output: string;
  ci?: boolean;
  allowHosts?: string;
  denyHosts?: string;
  sarif?: string;
  docker?: boolean;
  runner: string;
  dockerImage: string;
  npmCommand?: string;
}

function resolveProjectPath(projectPath = '.'): string {
  return resolve(projectPath);
}

function handleCliError(err: unknown): never {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

function assertSupportedProject(projectPath: string): void {
  const missing = ['package.json', 'package-lock.json'].filter(
    (name) => !existsSync(resolve(projectPath, name))
  );

  if (missing.length > 0) {
    throw new Error(
      `InstallSentry needs an npm project with package.json and package-lock.json v3.\nMissing: ${missing.join(
        ', '
      )}`
    );
  }

  try {
    if (!statSync(projectPath).isDirectory()) {
      throw new Error(`Project path is not a directory: ${projectPath}`);
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Project path is not a directory')) {
      throw err;
    }
    throw new Error(`Project path does not exist: ${projectPath}`);
  }
}

function scanProject(projectPath = '.'): void {
  const fullPath = resolveProjectPath(projectPath);
  assertSupportedProject(fullPath);
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
}

function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

function printRunSummary(
  analysis: AnalysisResult,
  graph: DependencyGraph,
  reportPath: string,
  sarifPath?: string
): void {
  const findings = buildFindings(analysis);
  const lifecycleCount = Array.from(graph.nodes.values()).filter((n) => n.hasLifecycleScripts).length;
  const networkHosts = new Set(analysis.networkRequests.map((r) => r.host).filter(Boolean));

  console.log('');
  if (findings.length > 0) {
    console.log(`InstallSentry found ${plural(findings.length, 'install-time risk')}`);
    console.log('');
    for (const finding of findings.slice(0, 10)) {
      console.log(
        `${finding.severity.padEnd(8)}  ${finding.package.padEnd(26)}  ${finding.detail}`
      );
    }
    if (findings.length > 10) {
      console.log(`... ${plural(findings.length - 10, 'more finding')}`);
    }
  } else {
    console.log('InstallSentry found no install-time risks.');
  }

  console.log('');
  console.log('Observed:');
  console.log(`  ${plural(lifecycleCount, 'package')} with lifecycle scripts`);
  console.log(`  ${plural(networkHosts.size, 'outbound network host')}`);
  console.log(`  ${plural(analysis.secretHits.length, 'secret canary hit')}`);
  console.log('');
  console.log(`Report: ${reportPath}`);
  if (sarifPath) {
    console.log(`SARIF:   ${sarifPath}`);
  }
}

function uniqueLines(lines: string[]): string[] {
  return Array.from(new Set(lines));
}

function printCiFailure(analysis: AnalysisResult, networkPolicy: ResolvedNetworkPolicy): void {
  const secretFindings = buildFindings(analysis).filter(
    (finding) => finding.severity === 'CRITICAL' || finding.severity === 'HIGH'
  );
  const networkViolations = getNetworkFindingsForCi(analysis.networkRequests, networkPolicy);
  const allowedHosts = Array.from(networkPolicy.allow.values()).sort();

  console.error('');
  console.error('CI gate FAILED');

  if (secretFindings.length > 0) {
    console.error('');
    console.error('Critical findings:');
    for (const line of uniqueLines(secretFindings.map((finding) => `  ${finding.package} ${finding.detail}`))) {
      console.error(line);
    }
  }

  if (networkViolations.length > 0) {
    console.error('');
    console.error('Network policy violations:');
    for (const line of uniqueLines(
      networkViolations.map(
        (request) =>
          `  ${request.host || request.url} was contacted by ${displayPackageIdForReport(request.package)}`
      )
    )) {
      console.error(line);
    }
  }

  if (allowedHosts.length > 0) {
    console.error('');
    console.error('Allowed network:');
    for (const host of allowedHosts) {
      console.error(`  ${host}`);
    }
  }

  console.error('');
  console.error('Fix:');
  if (secretFindings.length > 0) {
    console.error('  - Investigate packages that touched fake secret canaries.');
  }
  if (networkViolations.length > 0) {
    console.error(
      '  - If a network host is expected, allow it with --allow-hosts <host1,host2>.'
    );
  }
}

async function runProject(
  projectPath = '.',
  options: RunOptions,
  defaults: { npmCommand: NpmCommand; ci?: boolean } = { npmCommand: 'install' }
): Promise<void> {
  const fullPath = resolveProjectPath(projectPath);
  assertSupportedProject(fullPath);
  const rootPkg = parseJsonUtf8(readFileSync(resolve(fullPath, 'package.json'), 'utf-8')) as {
    name?: string;
    version?: string;
  };
  const config = loadInstallsentryConfig(fullPath);
  const networkPolicy = mergeNetworkPolicy(config, options.allowHosts, options.denyHosts);
  const runner: InstallRunner = resolveInstallRunner(options);
  const npmCommand = parseNpmCommand(options.npmCommand, defaults.npmCommand);
  const dockerImage = options.dockerImage?.trim() || undefined;
  const ciMode = options.ci || defaults.ci === true;

  console.log('Parsing lockfile...');
  const lockfile = parseLockfile(fullPath);
  const graph = buildGraph(fullPath, lockfile);

  const runnerLabel = runner === 'docker' ? 'Docker' : 'host';
  console.log(`Running ${runnerLabel} sandboxed npm ${npmCommand}...`);
  const sandbox = await runProjectInstall({
    projectPath: fullPath,
    runner,
    dockerImage,
    npmCommand,
    scriptName: npmCommand,
  });
  console.log(`npm ${npmCommand} exited with code ${sandbox.exitCode}`);
  if (sandbox.exitCode !== 0) {
    console.error('STDERR:', sandbox.stderr.slice(0, 2000));
  }

  console.log('Reading trace...');
  const events = existsSync(sandbox.traceFile) ? readTrace(sandbox.traceFile) : [];
  console.log(`Collected ${events.length} trace events`);

  console.log('Analyzing...');
  const analysis = analyzeTrace(events, graph);

  const out = resolve(options.output);
  const sarifPath = options.sarif ? resolve(options.sarif) : undefined;
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

  if (sarifPath) {
    writeSarifToFile(sarifPath, analysis, fullPath, { networkPolicy });
  }

  printRunSummary(analysis, graph, out, sarifPath);

  cleanupSandbox(sandbox.tempDir);

  if (ciMode) {
    const failed = ciShouldFail(analysis, networkPolicy);
    if (failed) {
      printCiFailure(analysis, networkPolicy);
      process.exit(1);
    }
    console.log('CI gate passed.');
  }
}

async function runDemo(options: RunOptions): Promise<void> {
  const tempDir = mkdtempSync(join(tmpdir(), 'installsentry-demo-'));
  try {
    const demoProject = createDemoProject(tempDir);
    console.log('Running InstallSentry demo project...');
    console.log('This uses a harmless local package that simulates secret exfiltration.');
    console.log('');
    await runProject(demoProject, options);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function addRunOptions(
  command: Command,
  defaultOutput = 'installsentry-report.html',
  defaultNpmCommand: NpmCommand = 'install'
): Command {
  return command
    .option('-o, --output <file>', 'Output HTML report path', defaultOutput)
    .option('--ci', 'Exit with non-zero if policy violation (secrets, or disallowed network)')
    .option(
      '--allow-hosts <list>',
      'CI: comma-separated host names allowed to receive traffic (enables allowlist; registry-only CI)'
    )
    .option('--deny-hosts <list>', 'CI: hosts that always fail when contacted (in addition to policy rules)')
    .option('--sarif <file>', 'Write SARIF 2.1.0 results to this file (in addition to HTML)')
    .option('--docker', 'Run the install step inside Docker (alias for --runner docker)')
    .option('--runner <name>', 'host or docker', 'host')
    .option('--npm-command <name>', 'npm command to replay: install or ci', defaultNpmCommand)
    .option('--docker-image <name>', 'Image when --runner docker (default: node:20-bookworm-slim)', '');
}

program
  .name('installsentry')
  .description('Supply-chain blast-radius visualizer for npm installs')
  .version('0.2.0')
  .argument('[path]', 'Path to project directory', '.')
  .action(async (projectPath: string) => {
    try {
      await runProject(projectPath, program.opts() as RunOptions);
    } catch (err) {
      handleCliError(err);
    }
  });

addRunOptions(program);

program
  .command('scan')
  .description('Scan package-lock.json for packages with lifecycle scripts')
  .argument('[path]', 'Path to project directory containing package-lock.json', '.')
  .action((projectPath: string) => {
    try {
      scanProject(projectPath);
    } catch (err) {
      handleCliError(err);
    }
  });

addRunOptions(
  program
    .command('ci')
    .description('Run CI-oriented analysis with npm ci and policy gating')
    .argument('[path]', 'Path to project directory', '.'),
  'installsentry-report.html',
  'ci'
)
  .action(async (projectPath: string, options: RunOptions) => {
    try {
      await runProject(projectPath, options, { npmCommand: 'ci', ci: true });
    } catch (err) {
      handleCliError(err);
    }
  });

addRunOptions(
  program
    .command('demo')
    .description('Run a harmless generated demo that simulates install-time secret exfiltration'),
  'installsentry-demo-report.html'
)
  .action(async (options: RunOptions) => {
    try {
      await runDemo(options);
    } catch (err) {
      handleCliError(err);
    }
  });

addRunOptions(
  program
  .command('run')
  .description('Run sandboxed install and generate blast-radius report')
  .argument('[path]', 'Path to project directory', '.')
)
  .action(
    async (
      projectPath: string,
      options: RunOptions
    ) => {
      try {
        await runProject(projectPath, options);
      } catch (err) {
        handleCliError(err);
      }
    }
  );

program.parse();
