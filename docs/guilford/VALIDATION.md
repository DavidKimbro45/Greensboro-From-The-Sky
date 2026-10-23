# Validation record

Validated on October 23, 2026 using Node 24.19.0.

- Production Vite build: passed. The original application retains large chunks; Vite reports its existing size warning.
- Original and local unit suite: passed (8,322 ordinary tests: 8,321 passed, one skipped; 15 allocation tests also passed).
- Local feed, input safety and integration rechecks: 39 passed.
- Formatting: 1,476 runtime/source files checked.
- Package/import boundaries: passed; 1,019 modules and 79 portable entry points checked.
- Live public source checks: county boundary, NCDOT county roads, NWS alerts, NWS hourly forecast and county hospital locations returned valid responses. Observed counts were one boundary feature, 19 road records, no active weather alerts, 156 hourly forecast periods and 13 hospital features. These are a point-in-time check, not permanently valid counts.
- Browser: production dashboard, public feeds, satellite basemap, a county GIS overlay, tab navigation, desktop close/reopen and restoration of original right-side controls checked. Mobile bounds and native close/reopen checked separately after correcting overlapping controls.

The managed browser does not trust this environment's HTTPS proxy certificate directly. Browser map checks therefore used live responses fetched through Node's configured CA trust and supplied to Chromium; TLS verification remained enabled. Optional paid/keyed providers were not provisioned or tested. This is not a claim that every original layer has coverage in Guilford County.

GitHub source repository: https://github.com/DavidKimbro45/Greensboro-From-The-Sky. After the user configured write access, upload from the managed cloud workspace succeeded. The original repository commit is preserved. See GITHUB_UPLOAD.md.
