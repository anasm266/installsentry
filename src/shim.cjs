/**
 * Runtime interception shim injected via NODE_OPTIONS=--require
 * Must be CommonJS so we can monkey-patch built-in modules.
 */

const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const cp = require('node:child_process');

const CANARY_SUBSTRINGS = (() => {
  try {
    const p = path.join(__dirname, 'canary-substrings.json');
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return [
      'fake_canary_npm_token',
      'fake_canary_aws_key',
      'fake_canary_aws_secret',
      'fake_canary_github_token',
      'fake_canary_ssh_key',
    ];
  }
})();

const TRACE_FILE = process.env.INSTALLSENTRY_TRACE_FILE;
const LEGACY_PACKAGE = process.env.INSTALLSENTRY_PACKAGE_NAME || 'unknown';
const CURRENT_SCRIPT = process.env.INSTALLSENTRY_SCRIPT_NAME || 'unknown';
const ATTR_INSTALL_ROOT = 'install-root';

if (!TRACE_FILE) {
  console.error('[installsentry-shim] TRACE_FILE not set, skipping instrumentation');
  process.exit(1);
}

/** Lockfile / graph id: e.g. node_modules/foo (forward slashes) or install-root for npm at project root */
function resolveAttributionPackageId() {
  const root = process.env.INSTALLSENTRY_PROJECT_ROOT;
  if (!root) {
    return LEGACY_PACKAGE;
  }
  const absRoot = path.resolve(root);
  const absCwd = path.resolve(process.cwd());
  let rel = path.relative(absRoot, absCwd);
  rel = rel.split(path.sep).join('/');
  if (!rel || rel === '.') {
    return ATTR_INSTALL_ROOT;
  }
  if (rel.startsWith('..')) {
    return 'unknown';
  }
  return rel;
}

function logEvent(type, details) {
  const event = {
    type,
    package: resolveAttributionPackageId(),
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
  const str = Buffer.isBuffer(data) ? data.toString('utf-8') : String(data);
  for (const c of CANARY_SUBSTRINGS) {
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
function buildUrlString(protocol, options) {
  if (typeof options === 'string') {
    return options;
  }
  if (options && typeof options === 'object') {
    if (options.href && typeof options.href === 'string') {
      return options.href;
    }
    return `${protocol}://${options.hostname || options.host || 'localhost'}${options.path || '/'}`;
  }
  return String(options);
}

function patchRequest(mod, protocol) {
  const orig = mod.request;
  mod.request = function (options, callback) {
    let method = 'GET';
    let host = '';

    const url = buildUrlString(protocol, options);

    if (options && typeof options === 'object' && typeof options !== 'string') {
      method = options.method || 'GET';
      host = options.hostname || options.host || 'localhost';
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

    const forScan = url;
    const canaries = isCanaryContent(forScan);

    logEvent('http.request', { url, method, host, canaries });
    return orig.call(mod, options, callback);
  };
}

patchRequest(http, 'http');
patchRequest(https, 'https');

// Node's http.get / https.get call the module-local `request`, not exports.request, so
// a patched `request` export is never used by `get` unless we replace `get` too.
function rewireGet(mod) {
  mod.get = function (input, options, callback) {
    const req = mod.request(input, options, callback);
    req.end();
    return req;
  };
}
rewireGet(http);
rewireGet(https);

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
