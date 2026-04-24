/**
 * Runtime interception shim injected via NODE_OPTIONS=--require
 * Patches fs, http, https, and child_process to log events during lifecycle script execution.
 */

import * as fs from 'node:fs';
import * as http from 'node:http';
import * as https from 'node:https';
import * as cp from 'node:child_process';
import { appendFileSync } from 'node:fs';

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

function isCanaryContent(data: string | Buffer): string[] {
  const hits: string[] = [];
  const str = Buffer.isBuffer(data) ? data.toString('utf-8') : data;
  const canaries = [
    'fake_canary_npm_token',
    'fake_canary_aws_key',
    'fake_canary_github_token',
    'fake_canary_ssh_key',
  ];
  for (const c of canaries) {
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
function patchRequest(mod: typeof http | typeof https, protocol: string) {
  const orig = mod.request;
  (mod as any).request = function (options: any, callback?: any) {
    let url = '';
    let method = 'GET';
    let host = '';

    if (typeof options === 'string') {
      url = options;
    } else {
      url = `${protocol}://${options.hostname || options.host || 'localhost'}${options.path || '/'}`;
      method = options.method || 'GET';
      host = options.hostname || options.host || 'localhost';
    }

    logEvent('http.request', { url, method, host });
    return (orig as any).call(mod, options, callback);
  };
}

patchRequest(http, 'http');
patchRequest(https, 'https');

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
