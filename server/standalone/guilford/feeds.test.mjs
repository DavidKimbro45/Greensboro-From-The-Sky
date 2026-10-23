import test from 'node:test';
import assert from 'node:assert/strict';
import { createFeedService, FEEDS, guilfordFeedsPlugin } from './feeds.js';
const collection = { type: 'FeatureCollection', features: [] };
const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

test('fixed feed routing scopes roads and alerts to Guilford', () => {
  assert.equal(new URL(FEEDS.traffic.url).searchParams.get('where'), "CountyName='Guilford'");
  assert.equal(new URL(FEEDS.alerts.url).searchParams.get('zone'), 'NCC081');
});
test('cache coalesces callers and expires at provider refresh interval', async () => {
  let now = 0, calls = 0;
  const service = createFeedService({ now: () => now, fetchImpl: async () => { calls++; return response(collection); } });
  const [a, b] = await Promise.all([service.load('traffic'), service.load('traffic')]);
  assert.deepEqual(a, b); assert.equal(calls, 1);
  await service.load('traffic'); assert.equal(calls, 1);
  now = FEEDS.traffic.ttl;
  await service.load('traffic'); assert.equal(calls, 2);
});
test('upstream failure keeps last successful timestamp and marks stale', async () => {
  let now = 0, fail = false;
  const service = createFeedService({ now: () => now, fetchImpl: async () => { if (fail) throw new Error('offline'); return response(collection); } });
  const first = await service.load('alerts'); fail = true; now = 120000;
  const stale = await service.load('alerts');
  assert.equal(stale.status, 'stale'); assert.equal(stale.retrievedAt, first.retrievedAt); assert.deepEqual(stale.data, first.data);
});
test('first failure never fabricates an empty successful feed', async () => {
  const service = createFeedService({ fetchImpl: async () => response({}, 503) });
  await assert.rejects(service.load('traffic'), /HTTP 503/);
});
test('ArcGIS errors and malformed forecasts are rejected', async () => {
  const service = createFeedService({ fetchImpl: async () => response({ error: { code: 400 } }) });
  await assert.rejects(service.load('boundary'), /unexpected/);
  await assert.rejects(service.load('forecast'), /unexpected/);
});
test('truncated ArcGIS payload is explicitly partial', async () => {
  const service = createFeedService({ fetchImpl: async () => response({ ...collection, exceededTransferLimit: true }) });
  assert.equal((await service.load('traffic')).status, 'partial');
});
test('unknown names including prototype keys never make an outbound request', async () => {
  let calls = 0;
  const service = createFeedService({ fetchImpl: async () => { calls++; return response(collection); } });
  for (const name of ['constructor', '__proto__', '../../secret', 'https://example.com']) await assert.rejects(service.load(name), /Unknown feed/);
  assert.equal(calls, 0);
});
test('middleware rejects unknown routes and mutations', async () => {
  let handler;
  guilfordFeedsPlugin().configureServer({ middlewares: { use: (mount, fn) => { assert.equal(mount, '/api/guilford'); handler = fn; } } });
  function result() { return { code: 200, setHeader() {}, writeHead(code) { this.code = code; }, end(body) { this.body = JSON.parse(body); } }; }
  const unknown = result(); await handler({ method: 'GET', url: '/constructor' }, unknown); assert.equal(unknown.code, 404);
  const post = result(); await handler({ method: 'POST', url: '/traffic' }, post); assert.equal(post.code, 405);
});
