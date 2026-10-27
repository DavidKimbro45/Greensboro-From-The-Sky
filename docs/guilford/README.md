# Greensboro from the Sky

A localized edition of [Bilawal Sidhu’s God’s Eye View](https://github.com/bilawalsidhu/gods-eye-view). It opens on Earth and flies into Guilford County, North Carolina. The county extension currently uses English. The original application and its global features remain in the repository; the additions provide a local situation panel and county GIS overlays.

## Open the cloud application

Use https://greensboro-from-the-sky.vercel.app. Sign in to the owning Vercel account if prompted. No download or installation on the shared device is needed. See [cloud runtime and release details](CLOUD_DEPLOYMENT.md).

## Run it in a development or hosting environment

Use Node **24.14 or later in the 24.x line**, or Node 26.x, with npm.

```sh
git clone https://github.com/DavidKimbro45/Greensboro-From-The-Sky.git greensboro-from-the-sky
cd greensboro-from-the-sky
npm ci
npm run dev
```

Open the localhost URL printed by Vite. No API keys are required for the basic globe or the new county feeds. The first visit can also show the original mission chooser; choose Explore Manually or press Escape to keep the county view. Use `/?welcome=0` to skip that chooser. Dragging or scrolling on the globe cancels the introductory flight. Shared camera links keep their original view. Programmatic camera navigation also takes precedence over the delayed county fly-in. Opening an original right-side tool or a street photo closes the county panel so its controls remain accessible.

For the production bundle with the Node provider server:

```sh
npm run build
npm start
```

Do not deploy only `dist/` to a static host: `/api` routes, original provider proxies and optional voice need the Node server. See the retained upstream Dockerfile, compose file and SECURITY.md for self-hosting. Public hosting needs a hostname allowlist, HTTPS and access controls; keep Provider Settings local. The production server serves the built globe and all provider middleware together. It requires `dist/index.html`, binds to `HOST` (default `0.0.0.0`) and `PORT` (default `8080`), and exposes `/healthz`. Exact hostnames in `GEV_ALLOWED_HOSTS` and the platform-provided Vercel deployment hostnames are allowed. Unknown hosts remain blocked. `Dockerfile.vercel` and `vercel.json` configure the complete Node application for Vercel Container Runtime (currently beta), rather than a static-only Vite deployment. Runtime caches and logs in a container are disposable. Provider keys must be configured through the cloud host; the local key editor is unavailable in this production server. Optional paid provider endpoints retain their upstream same-site checks; configuring a key alone does not make those endpoints available through every reverse proxy.

## Using the local dashboard

- **Earth / Zoom to county:** move between the world and the county. The destination menu includes Greensboro, High Point, PTI, Summerfield, Oak Ridge, Jamestown, Gibsonville, Pleasant Garden and Stokesdale. These are navigation presets, not measured objects.
- **Situation:** NWS hourly forecast, county weather alerts, current road incidents and scheduled work. Incident details include provider update dates and DriveNC links. Locate places an incident on the globe.
- **Map layers:** county boundary, current road markers, alert areas, hospital locations, parcels, zoning, schools, parks, flood zones, dams/waterways, wetlands, city limits, county property, contours, historic landmarks and NOAA radar. GIS layers switch the map to Esri imagery so they can render on the globe. Some layers require close zoom. Use **Inspect GIS at map center** to query the enabled GIS services.
- **Coverage:** original layer shortcuts, public source links, and explicit coverage limitations. Outages and local bus tracking are official-site links, not ingested live feeds.
- **Original controls:** DATA LAYERS, VISUAL PRESETS, LOCATIONS, map sources, cockpit tracking, scenes, annotations, imports, Street Level, provider settings and voice remain available. See the original README below and DATA_SOURCES.md. Actual availability depends on credentials and provider coverage; retaining a feature does not mean its source has local data.

## Source catalog

| Information | Source | Refresh / meaning |
| --- | --- | --- |
| County boundary | [Guilford County GIS](https://gcgis.guilfordcountync.gov/arcgis/rest/services/CountyBoundary/FeatureServer/0) | Reference geometry; cached 24 hours |
| Road incidents | [NCDOT TIMS](https://services.arcgis.com/NuWFvHYDMVmmxMeM/ArcGIS/rest/services/NCDOT_TIMS_Incidents/FeatureServer/0) | Filtered to CountyName=Guilford; 2-minute cache; planned and current events separated |
| Weather alerts | [NWS alerts API](https://api.weather.gov/alerts/active?zone=NCC081) | NCC081 county zone; 1-minute cache; some alerts lack polygons |
| Hourly forecast | [NWS RAH/32,66](https://api.weather.gov/gridpoints/RAH/32,66/forecast/hourly) | Greensboro forecast grid; 5-minute cache; a forecast, not a countywide observation |
| Hospital locations | [County POI service](https://gcgis.guilfordcountync.gov/arcgis/rest/services/GISDV/Points_of_Interest/FeatureServer/8) | Reference locations; cached 24 hours; no bed availability |
| County GIS overlays | [County GISDV services](https://gcgis.guilfordcountync.gov/arcgis/rest/services/GISDV) | Provider-maintained reference maps; scale limits and jurisdiction gaps apply |
| Weather radar | [NOAA/NCEP CONUS reflectivity WMS](https://opengeo.ncep.noaa.gov/geoserver/conus/conus_bref_qcd/ows?service=WMS&request=GetCapabilities) | Latest requested timestamp; provider timing/coverage apply; see radar note below |

The browser polls local feed routes every 30 seconds; each server feed respects the cache interval above. Duplicate upstream requests are coalesced. Refresh requests respect those intervals. Fetches stop in hidden tabs and resume when visible. Network requests time out, response sizes are bounded, and only fixed read-only URLs are permitted. Provider failures show unavailable or stale; old data keeps its original retrieval timestamp. No sample incidents are substituted. A successful empty alert response is displayed as no reported alerts, not a guarantee of safety. Long-running roadwork can have an old provider update date while remaining in the current feed.

The radar overlay is requested when enabled; disable/re-enable it to request a newer image. It is not an animated radar history or a continuously refreshing radar layer. Upstream global weather layers remain available separately.

County GIS data is reference data. The flood-zone overlay is the service’s layer named **Flood Zones Effective 06-10-2026**; it does not show current flooding. Parcel and zoning maps are not legal surveys. Camera poses, traffic animations, visual sensor styles and some original trajectories are estimates/simulations as described upstream. Missing tiles or signals do not establish clear conditions. This is a public-data exploration tool, not emergency dispatch.

## Optional original features

Copy `.env.example` to `.env` (ignored by Git), or use the original in-app Provider Settings on localhost. Never commit credentials.

| Feature | Optional configuration |
| --- | --- |
| Photorealistic 3D / terrain | Google Maps API key and/or Cesium ion token, according to provider terms |
| Voice and AI features | Supported OpenAI or Gemini credentials; see upstream setup and costs |
| Ship, camera, fire, traffic, street imagery and other providers | Provider-specific keys and local coverage listed in `.env.example` and DATA_SOURCES.md |

No accounts, keys, paid services, private cameras, private location feeds or emergency dispatch access have been provisioned by this build. There is no phone/person tracking or identity lookup. Inspect the original source and SECURITY.md before exposing provider features remotely.

## Development

Local additions are isolated in `src/standalone/guilford/` and `server/standalone/guilford/`. The shared controls accept an optional startup flight; the standalone edition supplies the county flight. Greensboro is added to the original destination/search table. Existing global layers and MIT attribution are retained.

```sh
node --test server/standalone/guilford/feeds.test.mjs src/standalone/guilford/config.test.mjs
npm run check:boundaries
npm test
npm run build
```

Tests cover fixed routes, cache/coalescing, expiry, partial responses, stale fallback, invalid providers, methods and link handling. The original suite is retained. Public feed checks depend on external availability.

For upstream updates, use the recorded base commit in UPSTREAM.md, review changes in an integration branch, then run the checks above. A clone created for this project is an independent repository, not a GitHub fork; it can retain an `upstream` Git remote without publishing your changes.
