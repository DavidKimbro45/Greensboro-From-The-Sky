import { flyToGuilford } from './guilford/camera.js';
import { createApplicationControls } from '../app/controls.js';
import { getStandaloneCatalog } from './catalog.js';
export function createStandaloneControls(options) {
  return createApplicationControls({
    startupFlight: flyToGuilford,
    startupMessage: 'Earth → Guilford County, North Carolina...',
    catalog: options?.catalog ?? getStandaloneCatalog(),
    ...options,
  });
}
