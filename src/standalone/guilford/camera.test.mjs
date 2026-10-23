import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import { flyToGuilford } from './camera.js';

function fixture() {
  const container = new EventTarget();
  const flights = [];
  const camera = {
    positionWC: new Cesium.Cartesian3(),
    setView({ destination }) { this.positionWC = Cesium.Cartesian3.clone(destination); },
    flyTo(options) { flights.push(options); },
    cancelFlight() {},
  };
  return { viewer: { camera, container, isDestroyed: () => false }, flights };
}

test('programmatic navigation during startup prevents the delayed county flight', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { viewer, flights } = fixture();
  const stop = flyToGuilford(viewer);
  const destination = Cesium.Cartesian3.fromDegrees(-121.49, 38.58, 900);
  viewer.camera.setView({ destination });
  t.mock.timers.tick(2500);
  assert.equal(flights.length, 0);
  assert.ok(Cesium.Cartesian3.equals(viewer.camera.positionWC, destination));
  stop();
});

test('an untouched globe still flies into the county', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { viewer, flights } = fixture();
  const stop = flyToGuilford(viewer);
  t.mock.timers.tick(2500);
  assert.equal(flights.length, 1);
  const target = Cesium.Cartographic.fromCartesian(flights[0].destination);
  assert.ok(Math.abs(Cesium.Math.toDegrees(target.longitude) + 79.79) < 0.001);
  stop();
});

test('a gesture or teardown before the delay prevents a late flight', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const gesture of [true, false]) {
    const { viewer, flights } = fixture();
    const stop = flyToGuilford(viewer);
    if (gesture) viewer.container.dispatchEvent(new Event('pointerdown'));
    else stop();
    t.mock.timers.tick(2500);
    assert.equal(flights.length, 0);
    stop();
  }
});
