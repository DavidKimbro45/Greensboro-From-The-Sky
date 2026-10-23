import * as Cesium from 'cesium';
import { COUNTY } from './config.js';

/** Start with Earth, then descend to the county; user input cancels the introduction. */
export function flyToGuilford(viewer) {
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(
      COUNTY.lon,
      COUNTY.lat,
      18000000,
    ),
    orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
  });
  let active = false;
  let cancelled = false;
  const container = viewer.container.ownerDocument || viewer.container;
  const cancel = () => {
    cancelled = true;
    clearTimeout(timer);
    if (active && !viewer.isDestroyed()) viewer.camera.cancelFlight();
    active = false;
  };
  const timer = setTimeout(() => {
    if (cancelled || viewer.isDestroyed()) return;
    active = true;
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(COUNTY.lon, COUNTY.lat, 85000),
      orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
      duration: globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')
        .matches
        ? 0
        : 7,
      easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
      complete: () => {
        active = false;
      },
      cancel: () => {
        active = false;
      },
    });
  }, 2500);
  container.addEventListener('pointerdown', cancel, { passive: true });
  container.addEventListener('wheel', cancel, { passive: true });
  return () => {
    cancel();
    container.removeEventListener('pointerdown', cancel);
    container.removeEventListener('wheel', cancel);
  };
}
