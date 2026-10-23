import test from 'node:test';
import assert from 'node:assert/strict';
import { activeTraffic, futureTraffic, safeWebUrl } from './config.js';
const record = (start, end) => ({ properties: { StartDateTime: start, EndDateTime: end } });
test('current, future and expired road records are distinguished', () => {
  const current = record(100, 300), future = record(250, 400), expired = record(0, 100), unknown = record(null, null);
  const data = [current, future, expired, unknown];
  assert.deepEqual(activeTraffic(data, 200), [current, unknown]);
  assert.deepEqual(futureTraffic(data, 200), [future]);
});
test('provider URLs cannot inject executable links', () => {
  assert.equal(safeWebUrl('javascript:alert(1)'), null);
  assert.equal(safeWebUrl('data:text/html,hello'), null);
  assert.equal(safeWebUrl('https://drivenc.gov/'), 'https://drivenc.gov/');
});
