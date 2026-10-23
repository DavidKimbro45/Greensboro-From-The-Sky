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
  // Programmatic navigation can happen before the delayed fly-in (search,
  // shared tools or browser QA). It must take precedence just like a gesture.
  const initialPosition = Cesium.Cartesian3.clone(viewer.camera.positionWC);
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
    if (
      initialPosition &&
      !Cesium.Cartesian3.equalsEpsilon(
        initialPosition,
        viewer.camera.positionWC,
        1e-9,
        1,
      )
    ) {
      cancelled = true;
      return;
    }
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
