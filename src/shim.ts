/**
 * Runtime interception shim injected via NODE_OPTIONS=--require
 * Patches fs, http, https, and child_process to log events during lifecycle script execution.
 */

import * as fs from 'node:fs';
import * as http from 'node:http';
import * as https from 'node:https';
import * as cp from 'node:child_process';
import { appendFileSync } from 'node:fs';
import CANARY_SUBSTRINGS from './canary-substrings.json' with { type: 'json' };

const TRACE_FILE = process.env.INSTALLSENTRY_TRACE_FILE;
const CURRENT_PACKAGE = process.env.INSTALLSENTRY_PACKAGE_NAME || 'unknown';
const CURRENT_SCRIPT = process.env.INSTALLSENTRY_SCRIPT_NAME || 'unknown';

if (!TRACE_FILE) {
  console.error('[installsentry-shim] TRACE_FILE not set, skipping instrumentation');
  process.exit(1);
}

function logEvent(type: string, details: Record<string, unknown>) {
  const event = {
    type,
    package: CURRENT_PACKAGE,
    script: CURRENT_SCRIPT,
    timestamp: Date.now(),
    details,
  };
  try {
    appendFileSync(TRACE_FILE as string, JSON.stringify(event) + '\n');
  } catch (err) {
    // silently fail to avoid breaking install
  }
}

// --- fs.readFile / readFileSync ---
const originalReadFile = fs.readFile;
const originalReadFileSync = fs.readFileSync;

const CANARY_LIST = CANARY_SUBSTRINGS as string[];

function isCanaryContent(data: string | Buffer): string[] {
  const hits: string[] = [];
  const str = Buffer.isBuffer(data) ? data.toString('utf-8') : String(data);
  for (const c of CANARY_LIST) {
    if (str.includes(c)) hits.push(c);
  }
  return hits;
}

(fs as any).readFile = function (
  path: string | Buffer | URL,
  options: any,
  callback?: any
) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  const cb = callback || (() => {});
  return (originalReadFile as any).call(fs, path, options, (err: any, data: any) => {
    if (!err && data != null) {
      const canaries = isCanaryContent(data);
      logEvent('fs.read', {
        path: String(path),
        size: data.length,
        canaries,
      });
    }
    cb(err, data);
  });
};

(fs as any).readFileSync = function (path: string | Buffer | URL, options?: any) {
  const data = (originalReadFileSync as any).call(fs, path, options);
  if (data != null) {
    const canaries = isCanaryContent(data);
    logEvent('fs.read', {
      path: String(path),
      size: data.length,
      canaries,
    });
  }
  return data;
};

// --- fs.writeFile / appendFile ---
const originalWriteFile = fs.writeFile;
const originalAppendFile = fs.appendFile;

(fs as any).writeFile = function (
  path: string | Buffer | URL,
  data: any,
  options: any,
  callback?: any
) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  const cb = callback || (() => {});
  logEvent('fs.write', { path: String(path), operation: 'writeFile' });
  return (originalWriteFile as any).call(fs, path, data, options, cb);
};

(fs as any).appendFile = function (
  path: string | Buffer | URL,
  data: any,
  options: any,
  callback?: any
) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  const cb = callback || (() => {});
  logEvent('fs.write', { path: String(path), operation: 'appendFile' });
  return (originalAppendFile as any).call(fs, path, data, options, cb);
};

// --- http.request / https.request ---
function buildUrlString(protocol: string, options: unknown): string {
  if (typeof options === 'string') {
    return options;
  }
  if (options && typeof options === 'object' && 'href' in (options as object)) {
    const h = (options as { href?: string }).href;
    if (h && typeof h === 'string') return h;
  }
  if (options && typeof options === 'object') {
    const o = options as {
      hostname?: string;
      host?: string;
      path?: string;
    };
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
        method = 'GET';
        host = u.host;
      } catch {
        host = 'localhost';
        method = 'GET';
      }
    }

    const canaries = isCanaryContent(url);
    logEvent('http.request', { url, method, host, canaries });
    return (orig as any).call(mod, options, callback);
  };
}

patchRequest(http, 'http');
patchRequest(https, 'https');

// Node's get() calls the internal `request` binding, not the patched export — rewire
// it to `mod.request` (our patched function).
function rewireGet(mod: typeof http | typeof https) {
  (mod as any).get = function (input: any, options?: any, callback?: any) {
    const req = (mod as any).request(input, options, callback);
    req.end();
    return req;
  };
}
rewireGet(http);
rewireGet(https);

// --- child_process.spawn / exec ---
const origSpawn = cp.spawn;
(cp as any).spawn = function (command: string, args?: any, options?: any) {
  logEvent('child_process.spawn', {
    command,
    args: Array.isArray(args) ? args : [],
  });
  return (origSpawn as any).call(cp, command, args, options);
};

const origExec = cp.exec;
(cp as any).exec = function (command: string, options?: any, callback?: any) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  logEvent('child_process.spawn', { command, args: [], shell: true });
  return (origExec as any).call(cp, command, options, callback);
};

console.log(`[installsentry-shim] Instrumentation active for ${CURRENT_PACKAGE}::${CURRENT_SCRIPT}`);
