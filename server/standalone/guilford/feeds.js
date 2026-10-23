import { readResponseJsonCapped } from '../../providers/common/http.js';

const county = 'https://gcgis.guilfordcountync.gov/arcgis/rest/services';
function query(base, values) {
  return `${base}/query?${new URLSearchParams(values)}`;
}
const geo = { where: '1=1', outFields: '*', outSR: '4326', f: 'geojson' };
export const FEEDS = Object.freeze({
  boundary: {
    url: query(`${county}/CountyBoundary/FeatureServer/0`, geo),
    source: 'Guilford County GIS',
    ttl: 86400000,
    kind: 'reference',
  },
  traffic: {
    url: query(
      'https://services.arcgis.com/NuWFvHYDMVmmxMeM/ArcGIS/rest/services/NCDOT_TIMS_Incidents/FeatureServer/0',
      {
        ...geo,
        where: "CountyName='Guilford'",
        resultRecordCount: '2000',
      },
    ),
    source: 'NCDOT TIMS / DriveNC',
    ttl: 120000,
    kind: 'refreshed',
  },
  alerts: {
    url: 'https://api.weather.gov/alerts/active?zone=NCC081',
    source: 'National Weather Service',
    ttl: 60000,
    kind: 'refreshed',
  },
  forecast: {
    url: 'https://api.weather.gov/gridpoints/RAH/32,66/forecast/hourly',
    source: 'National Weather Service · Greensboro grid RAH/32,66',
    ttl: 300000,
    kind: 'forecast',
  },
  hospitals: {
    url: query(`${county}/GISDV/Points_of_Interest/FeatureServer/8`, geo),
    source: 'Guilford County GIS · hospital locations',
    ttl: 86400000,
    kind: 'reference',
  },
});

/** Fixed, read-only upstreams; no caller-supplied URL or SQL can reach the network. */
export function createFeedService({ fetchImpl = fetch, now = Date.now } = {}) {
  const cache = new Map();
  const pending = new Map();
  async function load(name) {
    const feed = FEEDS[name];
    if (!Object.hasOwn(FEEDS, name)) throw new Error('Unknown feed');
    const previous = cache.get(name);
    if (previous && now() - previous.at < feed.ttl) return previous.payload;
    if (pending.has(name)) return pending.get(name);
    const request = (async () => {
      try {
        const response = await fetchImpl(feed.url, {
          headers: {
            'User-Agent': 'GuilfordGodsEye/1.0 (public situational dashboard)',
            Accept: 'application/geo+json, application/json',
          },
          signal: AbortSignal.timeout(20000),
          redirect: 'error',
        });
        if (!response.ok)
          throw new Error(`Provider returned HTTP ${response.status}`);
        const data = await readResponseJsonCapped(response, 8 * 1024 * 1024);
        if (
          data?.error ||
          (name === 'forecast'
            ? !Array.isArray(data?.properties?.periods)
            : !Array.isArray(data?.features))
        ) {
          throw new Error('Provider returned an unexpected data format');
        }
        // ArcGIS can silently truncate; surface this instead of claiming complete coverage.
        const partial = Boolean(
          data.exceededTransferLimit || data.properties?.exceededTransferLimit,
        );
        const at = now();
        const payload = {
          status: partial ? 'partial' : 'ready',
          source: feed.source,
          sourceUrl: feed.url,
          kind: feed.kind,
          retrievedAt: new Date(at).toISOString(),
          refreshSeconds: feed.ttl / 1000,
          data,
        };
        cache.set(name, { at, payload });
        return payload;
      } catch (error) {
        if (previous)
          return {
            ...previous.payload,
            status: 'stale',
            error: 'Refresh failed; showing the last successful retrieval.',
          };
        throw error;
      } finally {
        pending.delete(name);
      }
    })();
    pending.set(name, request);
    return request;
  }
  return { load };
}

export function guilfordFeedsPlugin() {
  const service = createFeedService();
  function install(server) {
    server.middlewares.use('/api/guilford', async (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      if (req.method !== 'GET') {
        res.writeHead(405, { Allow: 'GET' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
      }
      const name = new URL(req.url, 'http://localhost').pathname.slice(1);
      if (!Object.hasOwn(FEEDS, name)) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Unknown Guilford feed' }));
        return;
      }
      try {
        res.end(JSON.stringify(await service.load(name)));
      } catch {
        res.writeHead(502);
        res.end(
          JSON.stringify({
            status: 'unavailable',
            source: FEEDS[name].source,
            error:
              'Public provider unavailable. Retry later; no synthetic data is substituted.',
          }),
        );
      }
    });
  }
  return {
    name: 'guilford-public-feeds',
    configureServer: install,
    configurePreviewServer: install,
  };
}
