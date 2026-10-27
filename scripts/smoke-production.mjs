import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';

const base = process.argv[2] || 'http://127.0.0.1:8080';
let health;
for (let attempt = 0; attempt < 40; attempt++) {
  try {
    health = await fetch(new URL('/healthz', base), {
      signal: AbortSignal.timeout(1000),
    });
    if (health.ok) break;
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 500));
}
assert.equal(
  health?.status,
  200,
  'production server must become ready on its configured port',
);
assert.deepEqual(await health.json(), { status: 'ok' });
const document = await fetch(new URL('/', base));
assert.equal(document.status, 200);
const html = await document.text();
assert.match(html, /Greensboro from the Sky/);
assert.match(
  html,
  /\/assets\/[^" ]+\.js/,
  'serve the compiled UI, not a development entry',
);
const provider = await fetch(new URL('/api/mapillary/status', base));
assert.equal(provider.status, 200, 'provider middleware is present');
assert.match(provider.headers.get('content-type'), /application\/json/);
assert.equal(typeof (await provider.json()).configured, 'boolean');
const missing = await fetch(
  new URL('/api/production-smoke-unknown-route', base),
);
assert.equal(
  missing.status,
  404,
  'unknown APIs terminate instead of returning the UI',
);
assert.match(missing.headers.get('content-type'), /application\/json/);
const settings = await fetch(new URL('/api/setup/status', base));
assert.equal(
  settings.status,
  404,
  'local credential editor is unavailable in production',
);
const debugLog = await fetch(new URL('/api/realtime/debug-log', base), {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ event: 'production-smoke' }),
});
assert.equal(
  debugLog.status,
  204,
  'the runtime can write its disposable diagnostic log',
);
// Undici fetch owns Host, so use the HTTP client to exercise the actual wire header.
const untrusted = await new Promise((resolve, reject) => {
  const url = new URL('/healthz', base);
  const request = (url.protocol === 'https:' ? https : http).get(
    url,
    {
      headers: { Host: 'untrusted.invalid' },
    },
    (response) => {
      response.resume();
      resolve(response.statusCode);
    },
  );
  request.on('error', reject);
});
assert.equal(untrusted, 403, 'untrusted Host is rejected');
console.log(
  'Production smoke passed: configured port, health, compiled UI, provider JSON, API 404, disabled key editor, writable diagnostic directory, Host policy.',
);
