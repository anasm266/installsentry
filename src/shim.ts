/**
 * Runtime interception shim injected via NODE_OPTIONS=--require
 */

import * as fs from 'node:fs';
import * as http from 'node:http';
import * as https from 'node:https';
import * as net from 'node:net';
import * as tls from 'node:tls';
import * as dns from 'node:dns';
import * as cp from 'node:child_process';
import { appendFileSync } from 'node:fs';
import * as path from 'node:path';
import CANARY_SUBSTRINGS from './canary-substrings.json' with { type: 'json' };

const TRACE_FILE = process.env.INSTALLSENTRY_TRACE_FILE;
const LEGACY_PACKAGE = process.env.INSTALLSENTRY_PACKAGE_NAME || 'unknown';
const CURRENT_SCRIPT = process.env.INSTALLSENTRY_SCRIPT_NAME || 'unknown';
const SHIM_PATH = process.env.INSTALLSENTRY_SHIM_PATH || '';
const ATTR_INSTALL_ROOT = 'install-root';

if (!TRACE_FILE) {
  console.error('[installsentry-shim] TRACE_FILE not set, skipping instrumentation');
  process.exit(1);
}

const CANARY_LIST = CANARY_SUBSTRINGS as string[];

function npmEnvAttribution(): Record<string, string | undefined> {
  return {
    npmPackageName: process.env.npm_package_name,
    npmPackageVersion: process.env.npm_package_version,
    npmLifecycleEvent: process.env.npm_lifecycle_event,
    initCwd: process.env.INIT_CWD,
  };
}

function resolveAttributionPackageId(): string {
  const root = process.env.INSTALLSENTRY_PROJECT_ROOT;
  if (!root) return LEGACY_PACKAGE;
  const absRoot = path.resolve(root);
  const absCwd = path.resolve(process.cwd());
  let rel = path.relative(absRoot, absCwd);
  rel = rel.split(path.sep).join('/');
  if (!rel || rel === '.') return ATTR_INSTALL_ROOT;
  if (rel.startsWith('..')) return 'unknown';
  return rel;
}

function logEvent(type: string, details: Record<string, unknown>) {
  const event = {
    type,
    package: resolveAttributionPackageId(),
    script: CURRENT_SCRIPT,
    timestamp: Date.now(),
    details: {
      ...details,
      attribution: npmEnvAttribution(),
    },
  };
  try {
    appendFileSync(TRACE_FILE as string, JSON.stringify(event) + '\n');
  } catch {
    /* avoid breaking install */
  }
}

function isCanaryContent(data: string | Buffer): string[] {
  const hits: string[] = [];
  const str = Buffer.isBuffer(data) ? data.toString('utf-8') : String(data);
  for (const c of CANARY_LIST) {
    if (str.includes(c)) hits.push(c);
  }
  return hits;
}

function logHttp(method: string, url: string, host: string) {
  const canaries = isCanaryContent(url);
  logEvent('http.request', { url, method, host, canaries, category: 'high' });
}

function ensureNodeOptionsInEnv(env?: Record<string, string | undefined>): Record<string, string | undefined> {
  const base = env ? { ...env } : { ...(process.env as Record<string, string>) };
  if (!SHIM_PATH) return base;
  const flag = `--require ${SHIM_PATH}`;
  const existing = base.NODE_OPTIONS || '';
  if (!existing.includes(SHIM_PATH)) {
    base.NODE_OPTIONS = existing ? `${existing} ${flag}` : flag;
  }
  return base;
}

function isNodeBinary(command: string): boolean {
  const base = path.basename(command).toLowerCase();
  return base === 'node' || base === 'node.exe' || command === process.execPath;
}

// --- fs.readFile / readFileSync ---
const originalReadFile = fs.readFile;
const originalReadFileSync = fs.readFileSync;

(fs as any).readFile = function (filePath: string | Buffer | URL, options: any, callback?: any) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  const cb = callback || (() => {});
  return (originalReadFile as any).call(fs, filePath, options, (err: any, data: any) => {
    if (!err && data != null) {
      logEvent('fs.read', {
        path: String(filePath),
        size: data.length,
        canaries: isCanaryContent(data),
        category: 'high',
      });
    }
    cb(err, data);
  });
};

(fs as any).readFileSync = function (filePath: string | Buffer | URL, options?: any) {
  const data = (originalReadFileSync as any).call(fs, filePath, options);
  if (data != null) {
    logEvent('fs.read', {
      path: String(filePath),
      size: data.length,
      canaries: isCanaryContent(data),
      category: 'high',
    });
  }
  return data;
};

// --- fs.writeFile* / appendFile* ---
const originalWriteFile = fs.writeFile;
const originalWriteFileSync = fs.writeFileSync;
const originalAppendFile = fs.appendFile;
const originalAppendFileSync = fs.appendFileSync;

function logFsWrite(filePath: string | Buffer | URL, operation: string) {
  logEvent('fs.write', { path: String(filePath), operation, category: 'high' });
}

(fs as any).writeFile = function (filePath: string | Buffer | URL, data: any, options: any, callback?: any) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  logFsWrite(filePath, 'writeFile');
  return (originalWriteFile as any).call(fs, filePath, data, options, callback || (() => {}));
};

(fs as any).writeFileSync = function (filePath: string | Buffer | URL, data: any, options?: any) {
  logFsWrite(filePath, 'writeFileSync');
  return (originalWriteFileSync as any).call(fs, filePath, data, options);
};

(fs as any).appendFile = function (filePath: string | Buffer | URL, data: any, options: any, callback?: any) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  logFsWrite(filePath, 'appendFile');
  return (originalAppendFile as any).call(fs, filePath, data, options, callback || (() => {}));
};

(fs as any).appendFileSync = function (filePath: string | Buffer | URL, data: any, options?: any) {
  logFsWrite(filePath, 'appendFileSync');
  return (originalAppendFileSync as any).call(fs, filePath, data, options);
};

// --- http / https ---
function buildUrlString(protocol: string, options: unknown): string {
  if (typeof options === 'string') return options;
  if (options && typeof options === 'object' && 'href' in (options as object)) {
    const h = (options as { href?: string }).href;
    if (h && typeof h === 'string') return h;
  }
  if (options && typeof options === 'object') {
    const o = options as { hostname?: string; host?: string; path?: string };
    return `${protocol}://${o.hostname || o.host || 'localhost'}${o.path || '/'}`;
  }
  return String(options);
}

function patchRequest(mod: typeof http | typeof https, protocol: string) {
  const orig = mod.request;
  (mod as any).request = function (options: any, callback?: any) {
    const url = buildUrlString(protocol, options);
    let method = 'GET';
    let host = '';
    if (options && typeof options === 'object' && typeof options !== 'string') {
      const o = options as { method?: string; hostname?: string; host?: string };
      method = o.method || 'GET';
      host = o.hostname || o.host || 'localhost';
    } else {
      try {
        const u = new URL(url);
        host = u.host;
      } catch {
        host = 'localhost';
      }
    }
    logHttp(method, url, host);
    return (orig as any).call(mod, options, callback);
  };
}

patchRequest(http, 'http');
patchRequest(https, 'https');

function rewireGet(mod: typeof http | typeof https) {
  (mod as any).get = function (input: any, options?: any, callback?: any) {
    const req = (mod as any).request(input, options, callback);
    req.end();
    return req;
  };
}
rewireGet(http);
rewireGet(https);

// --- global fetch ---
const g = globalThis as { fetch?: typeof fetch };
if (typeof g.fetch === 'function') {
  const origFetch = g.fetch.bind(globalThis);
  g.fetch = async function (input: unknown, init?: RequestInit) {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : String((input as { url?: string })?.url || input);
    const method = init?.method || 'GET';
    let host = 'localhost';
    try {
      host = new URL(url).host;
    } catch {
      /* */
    }
    logHttp(method, url, host);
    return origFetch(input as Parameters<typeof fetch>[0], init);
  };
}

// --- dns ---
const origLookup = dns.lookup;
(dns as any).lookup = function (...args: unknown[]) {
  const hostname = typeof args[0] === 'string' ? args[0] : String(args[0]);
  logEvent('dns.lookup', { hostname, category: 'high' });
  return (origLookup as any).apply(dns, args);
};

// --- net / tls ---
const origConnect = net.connect;
(net as any).connect = function (...args: unknown[]) {
  logEvent('net.connect', { args: args.slice(0, 2), category: 'high' });
  return (origConnect as any).apply(net, args);
};

const origTlsConnect = tls.connect;
(tls as any).connect = function (...args: unknown[]) {
  logEvent('tls.connect', { args: args.slice(0, 2), category: 'high' });
  return (origTlsConnect as any).apply(tls, args);
};

// --- child_process ---
const origSpawn = cp.spawn;
(cp as any).spawn = function (command: string, args?: cp.SpawnOptions | readonly string[], options?: cp.SpawnOptions) {
  let spawnArgs: readonly string[] | undefined;
  let spawnOpts: cp.SpawnOptions | undefined;
  if (Array.isArray(args)) {
    spawnArgs = args;
    spawnOpts = options as cp.SpawnOptions;
  } else {
    spawnOpts = args as cp.SpawnOptions;
  }
  if (isNodeBinary(command) && spawnOpts) {
    spawnOpts = { ...spawnOpts, env: ensureNodeOptionsInEnv(spawnOpts.env as Record<string, string>) };
  } else if (isNodeBinary(command)) {
    spawnOpts = { env: ensureNodeOptionsInEnv() };
  }
  logEvent('child_process.spawn', {
    command,
    args: spawnArgs || [],
    category: 'high',
  });
  return (origSpawn as any).call(cp, command, spawnArgs, spawnOpts);
};

const origExec = cp.exec;
(cp as any).exec = function (command: string, options?: cp.ExecOptions, callback?: (...args: unknown[]) => void) {
  if (typeof options === 'function') {
    callback = options as (...args: unknown[]) => void;
    options = {};
  }
  logEvent('child_process.spawn', { command, args: [], shell: true, category: 'high' });
  return (origExec as any).call(cp, command, options, callback);
};

const origExecFile = cp.execFile;
(cp as any).execFile = function (
  file: string,
  args?: readonly string[] | cp.ExecFileOptions,
  options?: cp.ExecFileOptions,
  callback?: (...args: unknown[]) => void
) {
  let execArgs: readonly string[] | undefined;
  let execOpts: cp.ExecFileOptions | undefined;
  if (Array.isArray(args)) {
    execArgs = args;
    execOpts = options;
  } else {
    execOpts = args as cp.ExecFileOptions;
  }
  if (isNodeBinary(file) && execOpts) {
    execOpts = { ...execOpts, env: ensureNodeOptionsInEnv(execOpts.env as Record<string, string>) };
  }
  logEvent('child_process.spawn', { command: file, args: execArgs || [], category: 'high' });
  return (origExecFile as any).call(cp, file, execArgs, execOpts, callback);
};

const origFork = cp.fork;
(cp as any).fork = function (modulePath: string, args?: readonly string[], options?: cp.ForkOptions) {
  const forkOpts = options
    ? { ...options, env: ensureNodeOptionsInEnv(options.env as Record<string, string>) }
    : { env: ensureNodeOptionsInEnv() };
  logEvent('child_process.spawn', { command: modulePath, args: args || [], fork: true, category: 'high' });
  return (origFork as any).call(cp, modulePath, args, forkOpts);
};

const origSpawnSync = cp.spawnSync;
(cp as any).spawnSync = function (command: string, args?: readonly string[], options?: cp.SpawnSyncOptions) {
  logEvent('child_process.spawn', { command, args: args || [], sync: true, category: 'high' });
  return (origSpawnSync as any).call(cp, command, args, options);
};

console.log(
  `[installsentry-shim] Instrumentation active for ${resolveAttributionPackageId()}::${CURRENT_SCRIPT}`
);
