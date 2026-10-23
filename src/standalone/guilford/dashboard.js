import * as Cesium from 'cesium';
import {
  COUNTY,
  DESTINATIONS,
  GIS_LAYERS,
  activeTraffic,
  futureTraffic,
  safeWebUrl,
} from './config.js';
import './dashboard.css';

function el(tag, text, className) {
  const node = document.createElement(tag);
  // i18n-ignore: This county extension is English-only; upstream locale support is retained.
  if (text != null) node.textContent = String(text);
  if (className) node.className = className;
  return node;
}
function link(text, url) {
  const node = el('a', text);
  const safe = safeWebUrl(url);
  if (safe) {
    node.href = safe;
    node.target = '_blank';
    node.rel = 'noopener noreferrer';
  }
  return node;
}
const time = (value) =>
  new Date(value).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });

/** County dashboard owns only its own controls, sources and timers. Upstream stays intact. */
export function mountGuilfordDashboard({
  viewer,
  styleManager,
  mapStackController,
  dataManager,
  signal,
}) {
  let disposed = false;
  const listeners = [];
  const feeds = new Map();
  const sources = new Map();
  const imagery = new Map();
  const generations = new Map();
  const visible = new Map([
    ['boundary', true],
    ['traffic', true],
    ['alerts', true],
    ['hospitals', false],
  ]);
  const controller = new AbortController();
  const listen = (target, event, handler) => {
    target.addEventListener(event, handler);
    listeners.push(() => target.removeEventListener(event, handler));
  };
  const button = el('button', '◉ GREENSBORO SKY', 'gc-launch');
  button.type = 'button';
  button.setAttribute('aria-controls', 'gc-dashboard');
  button.setAttribute('aria-expanded', 'true');
  const panel = el('aside', null, 'gc-dashboard');
  panel.id = 'gc-dashboard';
  // i18n-ignore: This county extension is English-only; upstream locale support is retained.
  panel.setAttribute(
    'aria-label',
    'Greensboro from the Sky situational dashboard', // i18n-ignore: English-only county extension.
  );
  // i18n-ignore: This county extension is English-only; upstream locale support is retained.
  panel.innerHTML = `
    <header class="gc-heading"><div><span class="gc-eyebrow">NORTH CAROLINA · 36.08° N / 79.79° W</span><h2>GREENSBORO<br><span>FROM THE SKY</span></h2><p>Guilford County · Public signals. Local perspective.</p></div><button type="button" class="gc-close" aria-label="Close county dashboard">×</button></header>
    <div class="gc-nav"><button type="button" data-gc-nav="earth">Earth</button><button type="button" data-gc-nav="county">Zoom to county</button><button type="button" data-gc-nav="refresh">Refresh feeds</button></div>
    <label class="gc-destination">FLY TO<select aria-label="Local destination"></select></label>
    <div class="gc-tabs" role="tablist" aria-label="County information"><button type="button" role="tab" id="gc-tab-situation" aria-controls="gc-situation" aria-selected="true" data-tab="situation">Situation</button><button type="button" role="tab" id="gc-tab-layers" aria-controls="gc-layers" aria-selected="false" tabindex="-1" data-tab="layers">Map layers</button><button type="button" role="tab" id="gc-tab-sources" aria-controls="gc-sources" aria-selected="false" tabindex="-1" data-tab="sources">Coverage</button></div>
    <div class="gc-body"><section id="gc-situation" role="tabpanel" aria-labelledby="gc-tab-situation"><p class="gc-notice">Feed refreshes are periodic. Records can be delayed by their providers.</p><div class="gc-summary" role="status" aria-live="polite">Connecting to public sources…</div><div data-feed="forecast"></div><div data-feed="alerts"></div><div data-feed="traffic"></div></section><section id="gc-layers" role="tabpanel" aria-labelledby="gc-tab-layers" hidden><p class="gc-notice">GIS overlays use the imagery basemap. Some appear only when you zoom in. County reference layers do not represent live conditions.</p><div class="gc-layer-list"></div><button type="button" class="gc-inspect">Inspect GIS at map center</button><div class="gc-inspection" role="status" aria-live="polite"></div></section><section id="gc-sources" role="tabpanel" aria-labelledby="gc-tab-sources" hidden></section></div>
    <footer><span class="gc-clock"></span><span>PUBLIC DATA · NOT EMERGENCY DISPATCH</span></footer>`;
  document.body.append(button, panel);
  const q = (selector) => panel.querySelector(selector);
  const message = q('.gc-summary');
  function setOpen(open) {
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (!open && panel.contains(document.activeElement)) button.focus();
  }
  listen(button, 'click', () => setOpen(panel.hidden));
  listen(q('.gc-close'), 'click', () => setOpen(false));
  listen(panel, 'keydown', (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      setOpen(false);
    }
  });
  // Original tools can open their rail through map selection, voice or restore.
  // Yield the county panel so its CSS cannot hide or intercept those controls.
  const rightPanels = [
    'pp-toggles',
    'cctv-panel',
    'street-level-panel',
    'global-context-panel',
  ]
    .map((id) => document.getElementById(id))
    .filter(Boolean);
  const streetPhoto = document.getElementById('sl-viewer-wrap');
  const yieldToOriginalTools = () => {
    if (
      rightPanels.some((node) => !node.classList.contains('collapsed')) ||
      (streetPhoto && !streetPhoto.hidden)
    )
      setOpen(false);
  };
  const railObserver = new MutationObserver(yieldToOriginalTools);
  for (const node of rightPanels)
    railObserver.observe(node, {
      attributes: true,
      attributeFilter: ['class'],
    });
  if (streetPhoto)
    railObserver.observe(streetPhoto, {
      attributes: true,
      attributeFilter: ['hidden'],
    });
  listeners.push(() => railObserver.disconnect());
  yieldToOriginalTools();
  function navigate(lat, lon, height, duration = 2.5) {
    styleManager.orbitController?.stop();
    viewer.trackedEntity = undefined;
    viewer.camera.cancelFlight();
    viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(lon, lat, height),
      orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
      duration,
    });
  }
  const select = q('select');
  for (const [index, place] of DESTINATIONS.entries()) {
    const option = el('option', place.name);
    option.value = String(index);
    select.append(option);
  }
  listen(select, 'change', () => {
    const p = DESTINATIONS[Number(select.value)];
    navigate(p.lat, p.lon, p.height);
  });
  listen(q('[data-gc-nav="earth"]'), 'click', () =>
    navigate(COUNTY.lat, COUNTY.lon, 18000000),
  );
  listen(q('[data-gc-nav="county"]'), 'click', () =>
    navigate(COUNTY.lat, COUNTY.lon, 85000),
  );
  const tabs = [...panel.querySelectorAll('[data-tab]')];
  function selectTab(tab) {
    for (const item of tabs) {
      const on = item === tab;
      item.setAttribute('aria-selected', String(on));
      item.tabIndex = on ? 0 : -1;
      q(`#gc-${item.dataset.tab}`).hidden = !on;
    }
  }
  for (const [index, tab] of tabs.entries()) {
    listen(tab, 'click', () => selectTab(tab));
    listen(tab, 'keydown', (e) => {
      let next;
      if (e.key === 'ArrowRight') next = (index + 1) % tabs.length;
      if (e.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
      if (e.key === 'Home') next = 0;
      if (e.key === 'End') next = tabs.length - 1;
      if (next !== undefined) {
        e.preventDefault();
        selectTab(tabs[next]);
        tabs[next].focus();
      }
    });
  }
  function sourceStamp(payload) {
    const age = Date.now() - Date.parse(payload.retrievedAt);
    const stale =
      payload.status === 'stale' || age > payload.refreshSeconds * 2000;
    return `${stale ? 'STALE · ' : payload.status === 'partial' ? 'PARTIAL · ' : ''}Retrieved ${time(payload.retrievedAt)} · ${payload.source}`;
  }
  function section(name, title) {
    const root = q(`[data-feed="${name}"]`);
    root.replaceChildren(el('h3', title));
    return root;
  }
  function renderSituation() {
    const forecast = feeds.get('forecast');
    const weather = section('forecast', 'LOCAL WEATHER');
    if (forecast?.data) {
      const periods = forecast.data.properties.periods.filter(
        (p) => Date.parse(p.endTime) > Date.now(),
      );
      const current = periods[0];
      if (current) {
        weather.append(
          el(
            'div',
            `${current.temperature}°${current.temperatureUnit} · ${current.shortForecast}`,
            'gc-weather',
          ),
        );
        weather.append(
          el(
            'p',
            `Forecast for ${time(current.startTime)} · ${current.windDirection} ${current.windSpeed}`,
          ),
        );
        const strip = el('div', null, 'gc-hours');
        for (const p of periods.slice(1, 7))
          strip.append(
            el(
              'span',
              `${new Date(p.startTime).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric' })}\n${p.temperature}°${p.temperatureUnit}`,
            ),
          );
        weather.append(strip);
      } else
        weather.append(
          el('p', 'No future forecast periods in the last response.'),
        );
      weather.append(el('small', sourceStamp(forecast), 'gc-stamp'));
    } else
      weather.append(
        el('p', forecast?.error || 'Loading NWS forecast…', 'gc-muted'),
      );
    const alerts = feeds.get('alerts');
    const ar = section('alerts', 'WEATHER ALERTS · GUILFORD');
    if (alerts?.data) {
      const rows = alerts.data.features;
      if (!rows.length)
        ar.append(
          el(
            'p',
            'No active alerts reported in the latest NWS response.',
            'gc-clear',
          ),
        );
      for (const { properties: p } of rows) {
        const item = el('details', null, 'gc-record gc-alert');
        item.append(el('summary', `${p.severity} · ${p.event}`));
        item.append(el('p', p.headline));
        item.append(el('p', p.description));
        if (p.instruction) item.append(el('p', p.instruction));
        if (p.expires) item.append(el('small', `Expires ${time(p.expires)}`));
        item.append(link('NWS alert details ↗', p['@id'] || p.id));
        ar.append(item);
      }
      ar.append(el('small', sourceStamp(alerts), 'gc-stamp'));
    } else
      ar.append(el('p', alerts?.error || 'Loading county alerts…', 'gc-muted'));
    const traffic = feeds.get('traffic');
    const tr = section('traffic', 'ROADS · NCDOT TIMS');
    if (traffic?.data) {
      const current = activeTraffic(traffic.data.features);
      const future = futureTraffic(traffic.data.features);
      tr.append(
        el(
          'p',
          `${current.length} current records · ${future.length} scheduled`,
          'gc-count',
        ),
      );
      if (!current.length)
        tr.append(el('p', 'No current road incidents reported by this feed.'));
      const list = el('div', null, 'gc-road-list');
      for (const feature of [...current, ...future]) {
        const p = feature.properties;
        const card = el('details', null, 'gc-record');
        card.append(
          el(
            'summary',
            `${p.Road || 'Road incident'} · ${p.EventType || 'Incident'}${future.includes(feature) ? ' · scheduled' : ''}`,
          ),
        );
        card.append(
          el(
            'p',
            p.Location ||
              p.Reason ||
              p.Condition ||
              'No additional provider detail.',
          ),
        );
        if (p.Detour) card.append(el('p', `Detour: ${p.Detour}`));
        if (p.LastUpdateDateTime)
          card.append(
            el('small', `Provider update ${time(p.LastUpdateDateTime)}`),
          );
        const coords = feature.geometry?.coordinates;
        if (
          feature.geometry?.type === 'Point' &&
          coords?.every(Number.isFinite)
        ) {
          const fly = el('button', 'Locate on globe');
          fly.type = 'button';
          fly.onclick = () => navigate(coords[1], coords[0], 4500);
          card.append(fly);
        }
        card.append(link('DriveNC details ↗', p.DriveNCLink));
        list.append(card);
      }
      tr.append(list, el('small', sourceStamp(traffic), 'gc-stamp'));
    } else
      tr.append(
        el('p', traffic?.error || 'Loading county road incidents…', 'gc-muted'),
      );
    const good = ['forecast', 'alerts', 'traffic'].filter(
      (id) => feeds.get(id)?.data,
    ).length;
    const degraded = ['forecast', 'alerts', 'traffic'].some((id) => {
      const f = feeds.get(id);
      return (
        f?.data &&
        (f.status !== 'ready' ||
          Date.now() - Date.parse(f.retrievedAt) > f.refreshSeconds * 2000)
      );
    });
    // i18n-ignore: This county extension is English-only; upstream locale support is retained.
    message.textContent =
      good === 3 && !degraded // i18n-ignore: English-only county extension.
        ? '● Public feeds connected · automatic refresh' // i18n-ignore: English-only county extension.
        : `◌ ${good}/3 situation feeds available${degraded ? ' · stale or partial data' : ''}`; // i18n-ignore: English-only county extension.
    message.classList.toggle('gc-degraded', good !== 3 || degraded);
  }
  async function updateGeo(name, payload) {
    if (name === 'forecast') return;
    let data = payload.data;
    if (name === 'traffic')
      data = { ...data, features: activeTraffic(data.features) };
    const colors = {
      boundary: '#57e6d2',
      traffic: '#ffbd66',
      alerts: '#ff6578',
      hospitals: '#89c8ff',
    };
    const color = Cesium.Color.fromCssColorString(colors[name]);
    const ds = await Cesium.GeoJsonDataSource.load(data, {
      stroke: color,
      fill: color.withAlpha(0.12),
      strokeWidth: name === 'boundary' ? 3 : 2,
      clampToGround: true,
      markerColor: color,
      markerSize: 20,
    });
    if (disposed) {
      ds.entities.removeAll();
      return;
    }
    ds.name = `Guilford · ${name}`;
    for (const entity of ds.entities.values) {
      entity.description = '';
      if (entity.billboard) {
        entity.billboard = undefined;
        entity.point = new Cesium.PointGraphics({
          color,
          pixelSize: name === 'traffic' ? 9 : 7,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        });
      }
    }
    ds.show = visible.get(name);
    await viewer.dataSources.add(ds);
    if (disposed) {
      viewer.dataSources.remove(ds, true);
      return;
    }
    const old = sources.get(name);
    if (old) viewer.dataSources.remove(old, true);
    sources.set(name, ds);
    viewer.scene.requestRender();
  }
  const layerList = q('.gc-layer-list');
  const statuses = new Map();
  function row(id, label, note, checked, onChange) {
    const wrapper = el('div', null, 'gc-layer');
    const title = el('label');
    const input = el('input');
    input.type = 'checkbox';
    input.checked = checked;
    title.append(input, el('span', label));
    const status = el('small', note);
    wrapper.append(title, status);
    layerList.append(wrapper);
    statuses.set(id, status);
    listen(input, 'change', () => {
      Promise.resolve(onChange(input.checked, status)).catch(() => {
        // i18n-ignore: This county extension is English-only; upstream locale support is retained.
        status.textContent = 'Unavailable · try again later';
        input.checked = false;
      });
    });
    return input;
  }
  for (const [id, label, note] of [
    ['boundary', 'County boundary', 'Reference · Guilford County GIS'],
    ['traffic', 'Current road incidents', 'Refreshed every 2 minutes · NCDOT'],
    [
      'alerts',
      'Weather alert areas',
      'Refreshed every minute · NWS; some alerts have no polygon',
    ],
    [
      'hospitals',
      'Hospital location markers',
      'Reference · county GIS, no availability data',
    ],
  ]) {
    row(id, label, note, visible.get(id), (on) => {
      visible.set(id, on);
      if (sources.has(id)) sources.get(id).show = on;
      viewer.scene.requestRender();
    });
  }
  async function toggleImagery(id, on, status, create) {
    const generation = (generations.get(id) || 0) + 1;
    generations.set(id, generation);
    const old = imagery.get(id);
    if (old) {
      viewer.imageryLayers.remove(old.layer, true);
      old.removeError?.();
      imagery.delete(id);
    }
    if (!on) {
      // i18n-ignore: This county extension is English-only; upstream locale support is retained.
      status.textContent = 'Off · reference map service';
      viewer.scene.requestRender();
      return;
    }
    // i18n-ignore: This county extension is English-only; upstream locale support is retained.
    status.textContent = 'Connecting to map service…';
    await mapStackController.setStack('esri-imagery');
    if (disposed || generations.get(id) !== generation) return;
    const provider = await create();
    if (disposed || generations.get(id) !== generation) return;
    const layer = viewer.imageryLayers.addImageryProvider(provider);
    layer.alpha = 0.72;
    const removeError = provider.errorEvent.addEventListener(() => {
      if (!disposed && generations.get(id) === generation)
        // i18n-ignore: This county extension is English-only; upstream locale support is retained.
        status.textContent =
          'Map tile unavailable · provider coverage or connection issue'; // i18n-ignore: English-only county extension.
    });
    imagery.set(id, { layer, removeError });
    // i18n-ignore: This county extension is English-only; upstream locale support is retained.
    status.textContent = 'Enabled · provider scale limits apply';
    viewer.scene.requestRender();
  }
  for (const config of GIS_LAYERS)
    row(config.id, config.name, config.note, false, (on, status) =>
      toggleImagery(config.id, on, status, () =>
        Cesium.ArcGisMapServerImageryProvider.fromUrl(config.url, {
          layers: config.layers,
          enablePickFeatures: true,
          credit: 'Guilford County GIS',
        }),
      ),
    );
  row(
    'radar',
    'NOAA weather radar',
    'Latest published reflectivity · gaps do not mean clear weather',
    false,
    (on, status) =>
      toggleImagery(
        'radar',
        on,
        status,
        async () =>
          new Cesium.WebMapServiceImageryProvider({
            url: 'https://opengeo.ncep.noaa.gov/geoserver/conus/conus_bref_qcd/ows',
            layers: 'conus_bref_qcd',
            parameters: {
              transparent: true,
              format: 'image/png',
            },
            credit: 'NOAA / NCEP',
            enablePickFeatures: false,
          }),
      ),
  );
  listen(q('.gc-inspect'), 'click', async () => {
    const output = q('.gc-inspection');
    output.replaceChildren(
      el('p', 'Querying visible GIS layers at map center…'),
    );
    try {
      const ray = viewer.camera.getPickRay(
        new Cesium.Cartesian2(
          viewer.canvas.clientWidth / 2,
          viewer.canvas.clientHeight / 2,
        ),
      );
      const results = await (viewer.imageryLayers.pickImageryLayerFeatures(
        ray,
        viewer.scene,
      ) || Promise.resolve([]));
      if (disposed) return;
      output.replaceChildren();
      for (const info of results.slice(0, 12)) {
        const card = el('details', null, 'gc-record');
        card.append(el('summary', info.name || 'GIS feature'));
        const attrs = info.data?.attributes || info.properties || {};
        for (const [key, value] of Object.entries(attrs))
          if (value != null && typeof value !== 'object')
            card.append(el('p', `${key}: ${value}`));
        output.append(card);
      }
      if (!results.length)
        output.append(
          el(
            'p',
            'No feature returned here. Enable a county GIS overlay and zoom in, then try again.',
          ),
        );
    } catch {
      // i18n-ignore: This county extension is English-only; upstream locale support is retained.
      output.textContent =
        'GIS identify unavailable. Try another location or retry later.'; // i18n-ignore: English-only county extension.
    }
  });
  const coverage = q('#gc-sources');
  coverage.append(el('h3', 'WHAT THIS VIEW CAN SEE'));
  coverage.append(
    el(
      'p',
      'Guilford County is the local focus. Global layers and the original God’s Eye controls remain available in the surrounding interface.',
    ),
  );
  const upstreamFeatures = el(
    'p',
    'Use DATA LAYERS for aircraft, satellites, vessels, earthquakes, fires, air quality, transit, cameras and other original layers. Use VISUAL PRESETS for simulated sensor styles. GEV MIC and Provider Settings configure optional voice and provider access. Coverage depends on each source.',
  );
  coverage.append(upstreamFeatures);
  coverage.append(el('h3', 'ORIGINAL LAYERS'));
  for (const [id, label] of [
    ['flights', 'Aircraft'],
    ['satellites', 'Satellites'],
    ['earthquakes', 'Earthquakes'],
  ]) {
    const start = el('button', `Enable ${label}`);
    start.type = 'button';
    listen(start, 'click', async () => {
      start.disabled = true;
      try {
        const ok = await dataManager.setEnabled(id, true, { origin: 'user' });
        // i18n-ignore: This county extension is English-only; upstream locale support is retained.
        start.textContent =
          ok === false ? `${label}: unavailable` : `${label}: enabled`; // i18n-ignore: English-only county extension.
      } catch {
        // i18n-ignore: This county extension is English-only; upstream locale support is retained.
        start.textContent = `${label}: unavailable`;
      } finally {
        start.disabled = false;
      }
    });
    coverage.append(start);
  }
  const resources = [
    [
      'Guilford GIS & open data',
      'https://www.guilfordcountync.gov/government/departments-and-agencies/information-technology/geographic-information-systems/gis-online-services',
    ],
    [
      'DriveNC road conditions & public traffic cameras',
      'https://drivenc.gov/',
    ],
    [
      'NWS Greensboro forecast',
      'https://forecast.weather.gov/MapClick.php?lat=36.0726&lon=-79.792',
    ],
    [
      'Greensboro Transit Agency',
      'https://www.greensboro-nc.gov/departments/transit',
    ],
    ['Duke Energy outage map', 'https://outagemap.duke-energy.com/'],
    [
      'Guilford County GIS service catalog',
      'https://gcgis.guilfordcountync.gov/arcgis/rest/services',
    ],
    [
      'Original God’s Eye View & provider documentation',
      'https://github.com/bilawalsidhu/gods-eye-view',
    ],
  ];
  coverage.append(el('h3', 'PUBLIC SOURCE DIRECTORY'));
  for (const [name, url] of resources) coverage.append(link(`${name} ↗`, url));
  coverage.append(
    el('h3', 'COVERAGE & LIMITS'),
    el(
      'p',
      'No private cameras, phone tracking, private location data, police dispatch or person identification are connected. Public cameras, flight and vessel coverage may be delayed or absent. Traffic animation and sensor effects in the original app are visual simulations. County parcels, zoning, flood zones and facility locations are reference data; they are not live occupancy, flood observations or legal determinations. Utility outages and local bus positions are linked to their official sites, not ingested here. For an emergency call 911.',
    ),
  );
  let refreshing = false;
  async function refresh() {
    if (refreshing || disposed || document.hidden) return;
    refreshing = true;
    const refreshButton = q('[data-gc-nav="refresh"]');
    refreshButton.disabled = true;
    await Promise.allSettled(
      ['boundary', 'traffic', 'alerts', 'forecast', 'hospitals'].map(
        async (name) => {
          const previous = feeds.get(name);
          if (
            previous?.data &&
            Date.now() - Date.parse(previous.retrievedAt) <
              previous.refreshSeconds * 1000
          )
            return;
          try {
            const response = await fetch(`/api/guilford/${name}`, {
              signal: AbortSignal.any([
                controller.signal,
                AbortSignal.timeout(25000),
              ]),
              cache: 'no-store',
            });
            const payload = await response.json();
            if (!response.ok)
              throw new Error(payload.error || 'Provider unavailable');
            if (disposed) return;
            feeds.set(name, payload);
            if (
              !sources.has(name) ||
              previous?.retrievedAt !== payload.retrievedAt
            ) {
              try {
                await updateGeo(name, payload);
              } catch {
                if (statuses.has(name))
                  // i18n-ignore: This county extension is English-only; upstream locale support is retained.
                  statuses.get(name).textContent =
                    'Map geometry unavailable · feed details remain available'; // i18n-ignore: English-only county extension.
              }
            }
            if (statuses.has(name) && sources.has(name))
              // i18n-ignore: This county extension is English-only; upstream locale support is retained.
              statuses.get(name).textContent =
                `${payload.kind === 'reference' ? 'REFERENCE' : 'REFRESHED'} · ${sourceStamp(payload)}`;
          } catch (error) {
            if (disposed) return;
            feeds.set(
              name,
              previous?.data
                ? { ...previous, status: 'stale' }
                : {
                    status: 'unavailable',
                    error: 'Public provider unavailable. Retry later.',
                  },
            );
            if (statuses.has(name))
              // i18n-ignore: This county extension is English-only; upstream locale support is retained.
              statuses.get(name).textContent = previous?.data
                ? 'STALE · refresh failed'
                : 'Provider unavailable · retry later';
          }
        },
      ),
    );
    refreshing = false;
    if (disposed) return;
    refreshButton.disabled = false;
    renderSituation();
  }
  listen(q('[data-gc-nav="refresh"]'), 'click', refresh);
  listen(document, 'visibilitychange', () => {
    if (!document.hidden) void refresh();
  });
  function tick() {
    const clockText = new Date().toLocaleTimeString('en-US', {
      timeZone: 'America/New_York',
      hour12: false,
      timeZoneName: 'short',
    });
    // i18n-ignore: This county extension is English-only; upstream locale support is retained.
    q('.gc-clock').textContent = clockText;
  }
  tick();
  const clock = setInterval(tick, 1000);
  const poll = setInterval(() => {
    renderSituation();
    void refresh();
  }, 30000);
  renderSituation();
  void refresh();
  function destroy() {
    if (disposed) return;
    disposed = true;
    controller.abort();
    clearInterval(clock);
    clearInterval(poll);
    for (const remove of listeners) remove();
    for (const ds of sources.values()) viewer.dataSources.remove(ds, true);
    for (const { layer, removeError } of imagery.values()) {
      removeError?.();
      viewer.imageryLayers.remove(layer, true);
    }
    button.remove();
    panel.remove();
    signal?.removeEventListener('abort', destroy);
  }
  signal?.addEventListener('abort', destroy, { once: true });
  return { destroy };
}
