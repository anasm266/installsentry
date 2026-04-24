/**
 * Runtime interception shim injected via NODE_OPTIONS=--require
 * Must be CommonJS so we can monkey-patch built-in modules.
 */

const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const cp = require('node:child_process');

const TRACE_FILE = process.env.INSTALLSENTRY_TRACE_FILE;
const CURRENT_PACKAGE = process.env.INSTALLSENTRY_PACKAGE_NAME || 'unknown';
const CURRENT_SCRIPT = process.env.INSTALLSENTRY_SCRIPT_NAME || 'unknown';

if (!TRACE_FILE) {
  console.error('[installsentry-shim] TRACE_FILE not set, skipping instrumentation');
  process.exit(1);
}

function logEvent(type, details) {
  const event = {
    type,
    package: CURRENT_PACKAGE,
    script: CURRENT_SCRIPT,
    timestamp: Date.now(),
    details,
  };
  try {
    fs.appendFileSync(TRACE_FILE, JSON.stringify(event) + '\n');
  } catch (err) {
    // silently fail to avoid breaking install
  }
}

function isCanaryContent(data) {
  const hits = [];
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

// --- fs.readFile / readFileSync ---
const originalReadFile = fs.readFile;
const originalReadFileSync = fs.readFileSync;

fs.readFile = function (path, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  const cb = callback || (() => {});
  return originalReadFile.call(fs, path, options, (err, data) => {
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

fs.readFileSync = function (path, options) {
  const data = originalReadFileSync.call(fs, path, options);
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

fs.writeFile = function (path, data, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  const cb = callback || (() => {});
  logEvent('fs.write', { path: String(path), operation: 'writeFile' });
  return originalWriteFile.call(fs, path, data, options, cb);
};

fs.appendFile = function (path, data, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  const cb = callback || (() => {});
  logEvent('fs.write', { path: String(path), operation: 'appendFile' });
  return originalAppendFile.call(fs, path, data, options, cb);
};

// --- http.request / https.request ---
function patchRequest(mod, protocol) {
  const orig = mod.request;
  mod.request = function (options, callback) {
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
    return orig.call(mod, options, callback);
  };
}

patchRequest(http, 'http');
patchRequest(https, 'https');

// --- child_process.spawn / exec ---
const origSpawn = cp.spawn;
cp.spawn = function (command, args, options) {
  logEvent('child_process.spawn', {
    command,
    args: Array.isArray(args) ? args : [],
  });
  return origSpawn.call(cp, command, args, options);
};

const origExec = cp.exec;
cp.exec = function (command, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  logEvent('child_process.spawn', { command, args: [], shell: true });
  return origExec.call(cp, command, options, callback);
};

// Do not write to stdout — some lifecycle scripts parse child process stdout
