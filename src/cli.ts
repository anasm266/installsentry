#!/usr/bin/env node

import { Command } from 'commander';
import { join, resolve } from 'node:path';
import { readFileSync, existsSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { getLockfileAdapter } from './lockfile/index.js';
import { buildGraph } from './graph.js';
import { runProjectInstall, type InstallRunner } from './install-runner.js';
import { cleanupSandbox } from './sandbox.js';
import { readTrace } from './tracer.js';
import { analyzeTrace } from './analyzer.js';
import { generateReport } from './report.js';
import { loadInstallsentryConfig, defaultBaselinePath, type ReportFormat } from './config.js';
import { parseJsonUtf8 } from './json-utf8.js';
import {
  resolveCiPolicy,
  ciShouldFailWithPolicy,
  getNetworkViolationsForCi,
  getSecretFindingsForCi,
  type ResolvedCiPolicy,
} from './policy.js';
import { writeSarifToFile } from './sarif.js';
import { displayPackageIdForReport } from './attribution.js';
import type { AnalysisResult, DependencyGraph } from './types.js';
import { createDemoProject } from './demo.js';
import { resolveInstallRunner } from './runner-options.js';
import { parseInstallCommand, type InstallCommand } from './install-command.js';
import { buildFindings } from './findings.js';
import {
  detectPackageManager,
  requiredProjectFiles,
  type PackageManagerKind,
} from './package-manager.js';
import { buildJsonReport, writeJsonReport } from './output/json.js';
import { collectLifecyclePreviews } from './lifecycle-preview.js';
import { diffReports, diffHasBlockingChanges, loadBaseline, saveBaseline } from './diff.js';

const require = createRequire(import.meta.url);
const { version: CLI_VERSION } = require('../package.json') as { version: string };

const program = new Command();
program.enablePositionalOptions();

interface RunOptions {
  output: string;
  ci?: boolean;
  policy?: string;
  allowHosts?: string;
  denyHosts?: string;
  sarif?: string;
  docker?: boolean;
  dockerNetwork?: string;
  runner: string;
  dockerImage: string;
  npmCommand?: string;
  format?: string;
  packageManager?: string;
  saveBaseline?: boolean;
}

function resolveProjectPath(projectPath = '.'): string {
  return resolve(projectPath);
}

function handleCliError(err: unknown): never {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

function assertSupportedProject(projectPath: string, pmKind?: PackageManagerKind): PackageManagerKind {
  const detected = detectPackageManager(projectPath, pmKind);
  const missing = requiredProjectFiles(detected.kind).filter(
    (name) => !existsSync(resolve(projectPath, name))
  );
  if (missing.length > 0) {
    throw new Error(
      `InstallSentry needs a ${detected.kind} project with ${requiredProjectFiles(detected.kind).join(' and ')}.\nMissing: ${missing.join(', ')}`
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
  return detected.kind;
}

function scanProject(projectPath = '.', pmKind?: PackageManagerKind): void {
  const fullPath = resolveProjectPath(projectPath);
  const kind = assertSupportedProject(fullPath, pmKind);
  const adapter = getLockfileAdapter(kind);
  const lockfile = adapter.parse(fullPath);
  const graph = adapter.buildGraph(fullPath, lockfile);

  const risky = Array.from(graph.nodes.values()).filter((n) => n.hasLifecycleScripts);
  console.log(
    `Found ${risky.length} packages with lifecycle scripts out of ${graph.nodes.size} total dependencies (${kind}).`
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

function parseFormat(value: string | undefined, configFormat?: ReportFormat): ReportFormat {
  const v = (value || configFormat || 'html').toLowerCase();
  if (v === 'html' || v === 'json' || v === 'both') return v;
  throw new Error(`Unsupported format: ${value}. Use html, json, or both.`);
}

function printRunSummary(
  analysis: AnalysisResult,
  graph: DependencyGraph,
  reportPath: string,
  sarifPath?: string,
  jsonPath?: string
): void {
  const findings = buildFindings(analysis, graph);
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
  if (jsonPath) console.log(`JSON:    ${jsonPath}`);
  if (sarifPath) console.log(`SARIF:   ${sarifPath}`);
}

function printCiFailure(analysis: AnalysisResult, graph: DependencyGraph, policy: ResolvedCiPolicy): void {
  const secretFindings = getSecretFindingsForCi(buildFindings(analysis, graph));
  const networkViolations = getNetworkViolationsForCi(analysis, policy);
  const allowedHosts = Array.from(policy.network.allow.values()).sort();

  console.error('');
  console.error('CI gate FAILED');

  if (secretFindings.length > 0) {
    console.error('');
    console.error('Critical findings:');
    for (const finding of secretFindings) {
      console.error(`  ${finding.package} ${finding.detail}`);
    }
  }

  if (networkViolations.length > 0) {
    console.error('');
    console.error('Network policy violations:');
    for (const request of networkViolations) {
      console.error(
        `  ${request.host || request.url} was contacted by ${displayPackageIdForReport(request.package)}`
      );
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
  console.error(`Policy mode: ${policy.mode}`);
  console.error('');
  console.error('Fix:');
  if (secretFindings.length > 0) {
    console.error('  - Investigate packages that touched fake secret canaries.');
  }
  if (networkViolations.length > 0) {
    console.error(
      '  - If a network host is expected, allow it with --allow-hosts <host1,host2> or use --policy balanced.'
    );
  }
}

async function runProject(
  projectPath = '.',
  options: RunOptions,
  defaults: { installCommand: InstallCommand; ci?: boolean; policyDefault?: 'strict' | 'balanced' } = {
    installCommand: 'install',
  }
): Promise<void> {
  const fullPath = resolveProjectPath(projectPath);
  const pmKind = assertSupportedProject(
    fullPath,
    options.packageManager as PackageManagerKind | undefined
  );
  const rootPkg = parseJsonUtf8(readFileSync(resolve(fullPath, 'package.json'), 'utf-8')) as {
    name?: string;
    version?: string;
  };
  const config = loadInstallsentryConfig(fullPath);
  const ciPolicy = resolveCiPolicy(config, {
    policyCli: options.policy,
    allowHostsCli: options.allowHosts,
    denyHostsCli: options.denyHosts,
    defaultMode: defaults.policyDefault || (defaults.ci ? 'strict' : 'balanced'),
  });
  const runner: InstallRunner = resolveInstallRunner(options);
  const installCommand = parseInstallCommand(options.npmCommand, defaults.installCommand);
  const dockerImage = options.dockerImage?.trim() || config?.runner?.dockerImage?.trim() || undefined;
  const dockerNetwork =
    options.dockerNetwork === 'none' || config?.runner?.dockerNetwork === 'none' ? 'none' : 'default';
  const ciMode = options.ci || defaults.ci === true;
  const format = parseFormat(options.format, config?.report?.format);

  const adapter = getLockfileAdapter(pmKind);
  console.log(`Parsing ${pmKind} lockfile...`);
  const lockfile = adapter.parse(fullPath);
  const graph = adapter.buildGraph(fullPath, lockfile);

  const runnerLabel = runner === 'docker' ? 'Docker' : 'host';
  console.log(`Running ${runnerLabel} sandboxed ${pmKind} ${installCommand}...`);
  const sandbox = await runProjectInstall({
    projectPath: fullPath,
    packageManager: pmKind,
    runner,
    dockerImage,
    dockerNetwork,
    installCommand,
    scriptName: installCommand,
  });
  console.log(`${pmKind} ${installCommand} exited with code ${sandbox.exitCode}`);
  if (sandbox.exitCode !== 0) {
    console.error('STDERR:', sandbox.stderr.slice(0, 2000));
  }

  console.log('Reading trace...');
  const events = existsSync(sandbox.traceFile) ? readTrace(sandbox.traceFile) : [];
  console.log(`Collected ${events.length} trace events`);

  console.log('Analyzing...');
  const analysis = analyzeTrace(events, graph);
  const lifecyclePreviews = collectLifecyclePreviews(fullPath, graph);

  const htmlOut = resolve(options.output);
  const sarifPath = options.sarif
    ? resolve(options.sarif)
    : config?.report?.sarif
      ? resolve(fullPath, config.report.sarif)
      : undefined;
  const jsonOut =
    format === 'json' || format === 'both'
      ? htmlOut.replace(/\.html?$/i, '') + '.json'
      : undefined;

  if (format === 'html' || format === 'both') {
    console.log('Generating HTML report...');
    generateReport(
      {
        graph,
        analysis,
        targetPackage: rootPkg.name || 'unknown',
        targetVersion: rootPkg.version || '0.0.0',
        lifecyclePreviews,
      },
      htmlOut
    );
  }

  const jsonReport = buildJsonReport(
    {
      graph,
      analysis,
      targetPackage: rootPkg.name || 'unknown',
      targetVersion: rootPkg.version || '0.0.0',
    },
    {
      packageManager: pmKind,
      installsentryVersion: CLI_VERSION,
      policy: ciPolicy,
      ciPassed: !ciShouldFailWithPolicy(analysis, ciPolicy),
    }
  );

  if (jsonOut) {
    writeJsonReport(jsonOut, jsonReport);
  }

  const lastRunPath = resolve(fullPath, '.installsentry/last-run.json');
  saveBaseline(lastRunPath, jsonReport);

  if (sarifPath) {
    writeSarifToFile(sarifPath, analysis, fullPath, {
      networkPolicy: ciPolicy.network,
      graph,
    });
  }

  if (options.saveBaseline) {
    const baselinePath = resolve(fullPath, defaultBaselinePath(config));
    saveBaseline(baselinePath, jsonReport);
    console.log(`Baseline saved: ${baselinePath}`);
  }

  const reportDisplay = format === 'json' ? jsonOut! : htmlOut;
  printRunSummary(analysis, graph, reportDisplay, sarifPath, jsonOut);

  cleanupSandbox(sandbox.tempDir);

  if (ciMode) {
    if (ciShouldFailWithPolicy(analysis, ciPolicy)) {
      printCiFailure(analysis, graph, ciPolicy);
      process.exit(1);
    }
    console.log('CI gate passed.');
  }
}

function runDiff(projectPath = '.', baselinePath?: string): void {
  const fullPath = resolveProjectPath(projectPath);
  const config = loadInstallsentryConfig(fullPath);
  const baseline = resolve(fullPath, baselinePath || defaultBaselinePath(config));
  const currentPath = resolve(fullPath, '.installsentry/last-run.json');

  if (!existsSync(baseline)) {
    throw new Error(`No baseline at ${baseline}. Run with --save-baseline first.`);
  }
  if (!existsSync(currentPath)) {
    throw new Error(`No last run at ${currentPath}. Run installsentry run . first.`);
  }

  const base = loadBaseline(baseline);
  const current = loadBaseline(currentPath);
  if (!base || !current) {
    throw new Error('Failed to load baseline or current report JSON.');
  }

  const diff = diffReports(current, base);
  console.log('');
  if (diff.newFindings.length === 0) {
    console.log('No new findings since baseline.');
    return;
  }
  console.log(`New findings since baseline (${diff.newFindings.length}):`);
  for (const f of diff.newFindings) {
    console.log(`  ${f.severity}  ${f.package}  ${f.detail}`);
  }
  if (diffHasBlockingChanges(diff)) {
    process.exit(1);
  }
}

async function runDemo(options: RunOptions): Promise<void> {
  const tempDir = mkdtempSync(join(tmpdir(), 'installsentry-demo-'));
  try {
    const demoProject = createDemoProject(tempDir);
    console.log('Running InstallSentry demo project...');
    console.log('This uses a harmless local package that simulates secret exfiltration.');
    console.log('');
    await runProject(demoProject, { ...options, packageManager: 'npm' });
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function addRunOptions(
  command: Command,
  defaultOutput = 'installsentry-report.html',
  defaultInstallCommand: InstallCommand = 'install'
): Command {
  return command
    .option('-o, --output <file>', 'Output report path', defaultOutput)
    .option('--format <type>', 'Report format: html, json, or both', 'html')
    .option('--ci', 'Exit with non-zero if policy violation')
    .option('--policy <mode>', 'CI policy: balanced, strict, or custom')
    .option('--allow-hosts <list>', 'Comma-separated allowed network hosts')
    .option('--deny-hosts <list>', 'Comma-separated denied network hosts')
    .option('--sarif <file>', 'Write SARIF 2.1.0 results')
    .option('--docker', 'Run install inside Docker (alias for --runner docker)')
    .option('--docker-network <mode>', 'Docker network: default or none', 'default')
    .option('--runner <name>', 'host or docker', 'host')
    .option('--package-manager <name>', 'npm, pnpm, or yarn (auto-detect if omitted)')
    .option('--npm-command <name>', 'install or ci', defaultInstallCommand)
    .option('--docker-image <name>', 'Docker image when using --runner docker', '')
    .option('--save-baseline', 'Save JSON report as policy baseline');
}

program
  .name('installsentry')
  .description('See what npm packages do during install')
  .version(CLI_VERSION)
  .argument('[path]', 'Path to project directory', '.')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts() as RunOptions;
    if (!opts.output) opts.output = 'installsentry-report.html';
  })
  .action(async (projectPath: string, options: RunOptions) => {
    try {
      await runProject(projectPath, options);
    } catch (err) {
      handleCliError(err);
    }
  });

addRunOptions(program as Command);

program
  .command('scan')
  .description('Scan lockfile for packages with lifecycle scripts')
  .argument('[path]', 'Project directory', '.')
  .option('--package-manager <name>', 'npm, pnpm, or yarn')
  .action((projectPath: string, opts: { packageManager?: string }) => {
    try {
      scanProject(projectPath, opts.packageManager as PackageManagerKind | undefined);
    } catch (err) {
      handleCliError(err);
    }
  });

addRunOptions(
  program
    .command('ci')
    .description('CI-oriented analysis (frozen install + policy gate)')
    .argument('[path]', 'Project directory', '.'),
  'installsentry-report.html',
  'ci'
).action(async (projectPath: string, options: RunOptions) => {
  try {
    await runProject(projectPath, options, {
      installCommand: 'ci',
      ci: true,
      policyDefault: 'strict',
    });
  } catch (err) {
    handleCliError(err);
  }
});

addRunOptions(
  program.command('demo').description('Run harmless demo simulating install-time exfiltration'),
  'installsentry-demo-report.html'
).action(async (options: RunOptions) => {
  try {
    await runDemo(options);
  } catch (err) {
    handleCliError(err);
  }
});

program
  .command('diff')
  .description('Compare last run JSON to saved baseline')
  .argument('[path]', 'Project directory', '.')
  .option('--baseline <file>', 'Baseline JSON path')
  .action((projectPath: string, opts: { baseline?: string }) => {
    try {
      runDiff(projectPath, opts.baseline);
    } catch (err) {
      handleCliError(err);
    }
  });

addRunOptions(
  program.command('run').description('Run sandboxed install and generate report').argument('[path]', '.', '.')
).action(async (projectPath: string, options: RunOptions) => {
  try {
    await runProject(projectPath, options);
  } catch (err) {
    handleCliError(err);
  }
});

program.parse();
