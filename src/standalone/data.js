import { mountGuilfordDashboard } from './guilford/dashboard.js';
import { createApplicationData } from '../app/data.js';
import { getStandaloneCatalog } from './catalog.js';
export function createStandaloneData(options) {
  const data = createApplicationData({
    catalog: options?.catalog ?? getStandaloneCatalog(),
    ...options,
  });
  const dashboard = mountGuilfordDashboard({
    viewer: options.scene.viewer,
    mapStackController: options.scene.mapStackController,
    styleManager: options.controls.styleManager,
    dataManager: data.dataManager,
    signal: options.signal,
  });
  options.defer(() => dashboard.destroy());
  return data;
}
