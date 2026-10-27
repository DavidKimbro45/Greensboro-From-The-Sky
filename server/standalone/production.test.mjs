import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { runProductionCli } from '../../scripts/start.mjs';
import {
  PRODUCTION_ROOT,
  productionReadinessPlugin,
  resolveProductionOptions,
  startProductionServer,
} from './production.js';

async function fixture(t, { built = true } = {}) {
  const root = await realpath(
    await mkdtemp(path.join(tmpdir(), 'gev-production-')),
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  if (built) {
    await mkdir(path.join(root, 'dist'));
    await writeFile(
      path.join(root, 'dist', 'index.html'),
      '<h1>Application</h1>',
    );
  }
  return root;
}

test('production defaults bind the platform port and use the module root', () => {
  assert.deepEqual(resolveProductionOptions({}), {
    host: '0.0.0.0',
    port: 8080,
    allowedHosts: ['localhost', '127.0.0.1'],
  });
  assert.equal(
    PRODUCTION_ROOT,
    fileURLToPath(new URL('../../', import.meta.url)).replace(/[\\/]$/, ''),
  );
  assert.equal(
    resolveProductionOptions({ PORT: '65535', HOST: '::' }).port,
    65535,
  );
  assert.equal(resolveProductionOptions({ HOST: '::' }).host, '::');
});

test('production rejects malformed ports and bind hosts before listening', () => {
  for (const PORT of [
    '0',
    '-1',
    '65536',
    '8080oops',
    '8e3',
    '80.5',
    'Infinity',
  ]) {
    assert.throws(() => resolveProductionOptions({ PORT }), /PORT must/);
  }
  for (const HOST of [
    'https://example.com',
    '*.example.com',
    'host:8080',
    'a/b',
  ]) {
    assert.throws(() => resolveProductionOptions({ HOST }), /HOST must/);
  }
  assert.equal(
    resolveProductionOptions({ HOST: 'localhost', PORT: ' 9000 ' }).port,
    9000,
  );
});

test('exact configured and platform hosts join the allowlist without wildcards', () => {
  const env = Object.freeze({
    GEV_ALLOWED_HOSTS: 'Globe.example.com, ,localhost,globe.example.com',
    VERCEL_URL: 'project-commit.vercel.app',
    VERCEL_BRANCH_URL: 'project-git-main.vercel.app',
    VERCEL_PROJECT_PRODUCTION_URL: 'project.vercel.app',
    RENDER_EXTERNAL_HOSTNAME: 'project.onrender.com',
    OPENAI_API_KEY: 'must-not-appear',
  });
  assert.deepEqual(resolveProductionOptions(env).allowedHosts, [
    'localhost',
    '127.0.0.1',
    'globe.example.com',
    'project-commit.vercel.app',
    'project-git-main.vercel.app',
    'project.vercel.app',
    'project.onrender.com',
  ]);
  assert.ok(
    !JSON.stringify(resolveProductionOptions(env)).includes('must-not-appear'),
  );
});

test('unsafe hostname configuration fails with the variable name only', () => {
  for (const variable of [
    'GEV_ALLOWED_HOSTS',
    'VERCEL_URL',
    'VERCEL_BRANCH_URL',
    'VERCEL_PROJECT_PRODUCTION_URL',
    'RENDER_EXTERNAL_HOSTNAME',
  ]) {
    for (const value of [
      '*.example.com',
      '.example.com',
      'https://secret@example.com/a',
    ]) {
      assert.throws(
        () => resolveProductionOptions({ [variable]: value }),
        (error) =>
          error.message.includes(variable) && !error.message.includes(value),
      );
    }
  }
});

function readinessRequest(method, url) {
  let middleware;
  productionReadinessPlugin().configurePreviewServer({
    middlewares: {
      use(handler) {
        middleware = handler;
      },
    },
  });
  const response = {
    headers: {},
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    end(body) {
      this.body = body ?? '';
    },
  };
  let continued = false;
  middleware({ method, url }, response, () => {
    continued = true;
  });
  return { response, continued };
}

test('readiness GET and HEAD need no providers and never cache responses', () => {
  const get = readinessRequest('GET', '/healthz?probe=1');
  assert.equal(get.continued, false);
  assert.equal(get.response.statusCode, 200);
  assert.deepEqual(JSON.parse(get.response.body), { status: 'ok' });
  assert.equal(get.response.headers['cache-control'], 'no-store');
  assert.match(get.response.headers['content-type'], /application\/json/);
  const head = readinessRequest('HEAD', '/healthz');
  assert.equal(head.response.statusCode, 200);
  assert.equal(head.response.body, '');
  assert.equal(
    head.response.headers['content-length'],
    Buffer.byteLength(get.response.body),
  );
});

test('readiness rejects writes and passes other paths to the application', () => {
  const post = readinessRequest('POST', '/healthz');
  assert.equal(post.response.statusCode, 405);
  assert.equal(post.response.headers.allow, 'GET, HEAD');
  assert.deepEqual(JSON.parse(post.response.body), {
    error: 'Method not allowed',
  });
  for (const url of ['/', '/healthz/child', '/api/healthz']) {
    assert.equal(readinessRequest('GET', url).continued, true);
  }
});

test('missing or non-file builds fail before Vite starts', async (t) => {
  const root = await fixture(t, { built: false });
  const previewImpl = () => assert.fail('must not listen without a build');
  await assert.rejects(
    startProductionServer({ root, previewImpl }),
    /npm run build/,
  );
  await mkdir(path.join(root, 'dist', 'index.html'), { recursive: true });
  await assert.rejects(
    startProductionServer({ root, previewImpl }),
    /npm run build/,
  );
});

test('startup retains the root config, strict port and preview readiness plugin', async (t) => {
  const root = await fixture(t);
  const server = { close() {} };
  const env = { PORT: '9001', VERCEL_URL: 'preview.vercel.app' };
  const result = await startProductionServer({
    root,
    env,
    loadEnvImpl(mode, envRoot, prefix) {
      assert.equal(mode, 'production');
      assert.equal(envRoot, root);
      assert.equal(prefix, '');
      return { PORT: '9002', GEV_ALLOWED_HOSTS: 'dotenv.example.com' };
    },
    previewImpl(config) {
      assert.equal(config.root, root);
      assert.equal(config.configFile, path.join(root, 'vite.config.js'));
      assert.equal(config.mode, 'production');
      assert.deepEqual(config.preview, {
        host: '0.0.0.0',
        port: 9001,
        strictPort: true,
        allowedHosts: [
          'localhost',
          '127.0.0.1',
          'dotenv.example.com',
          'preview.vercel.app',
        ],
      });
      assert.equal(config.plugins.length, 1);
      assert.equal(typeof config.plugins[0].configurePreviewServer, 'function');
      return server;
    },
  });
  assert.equal(result, server);
});

test('startup propagates bind failures and rejects invalid options before preview', async (t) => {
  const root = await fixture(t);
  const failure = new Error('address already in use');
  await assert.rejects(
    startProductionServer({
      root,
      env: {},
      loadEnvImpl: () => ({}),
      previewImpl: async () => {
        throw failure;
      },
    }),
    (error) => error === failure,
  );
  await assert.rejects(
    startProductionServer({
      root,
      env: { PORT: '0' },
      loadEnvImpl: () => ({}),
      previewImpl: () => assert.fail('must validate before listening'),
    }),
    /PORT must/,
  );
});

function cliRuntime() {
  const runtime = new EventEmitter();
  runtime.exits = [];
  runtime.exit = (code) => runtime.exits.push(code);
  return runtime;
}

const silentLogger = { log() {}, error() {} };

test('CLI startup failures set a failing exit code without installing signal handlers', async () => {
  const runtime = cliRuntime();
  const errors = [];
  const result = await runProductionCli({
    runtime,
    logger: { ...silentLogger, error: (message) => errors.push(message) },
    startServer: async () => {
      throw new Error('Build is missing');
    },
  });
  assert.equal(result, null);
  assert.equal(runtime.exitCode, 1);
  assert.deepEqual(runtime.eventNames(), []);
  assert.match(errors[0], /Start refused: Build is missing/);
});

test('CLI signals await graceful close once before exiting', async () => {
  const runtime = cliRuntime();
  let resolveClose;
  let closes = 0;
  const server = {
    printUrls() {},
    close() {
      closes++;
      return new Promise((resolve) => {
        resolveClose = resolve;
      });
    },
  };
  await runProductionCli({
    runtime,
    logger: silentLogger,
    startServer: async () => server,
  });
  const first = runtime.listeners('SIGTERM')[0]();
  await runtime.listeners('SIGINT')[0]();
  assert.equal(closes, 1);
  assert.deepEqual(runtime.exits, []);
  resolveClose();
  await first;
  assert.deepEqual(runtime.exits, [0]);
});

test('CLI shutdown failures report a failing exit status', async () => {
  const runtime = cliRuntime();
  const errors = [];
  await runProductionCli({
    runtime,
    logger: { ...silentLogger, error: (message) => errors.push(message) },
    startServer: async () => ({
      printUrls() {},
      async close() {
        throw new Error('Close failed');
      },
    }),
  });
  await runtime.listeners('SIGTERM')[0]();
  assert.deepEqual(runtime.exits, [1]);
  assert.match(errors[0], /Shutdown failed: Close failed/);
});
