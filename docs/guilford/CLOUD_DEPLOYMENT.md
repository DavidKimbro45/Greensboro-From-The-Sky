# Open the cloud dashboard

https://greensboro-from-the-sky.vercel.app

The application runs in the `greensboro-from-the-sky` Vercel project under the connected `davkimbro-3218` team. Vercel's default deployment protection is preserved; sign in with the owning Vercel account if prompted. Nothing needs to be installed on the shared device.

## Runtime

The deployment runs the complete Node application, including the built Cesium UI and the original provider middleware. `npm start` checks for `dist/index.html`, uses the hosting `PORT`, serves `/healthz`, and rejects unrecognized hostnames. The image runs as the non-root `node` user. Only its disposable cache and log directories are writable. These do not provide durable storage.

The Vercel Container Runtime is currently beta. The project's runtime settings are `PORT=8080`, `HOST=0.0.0.0`, and `GEV_ALLOWED_HOSTS=greensboro-from-the-sky.vercel.app`. Exact platform deployment hostnames are accepted by the launcher; wildcard hosts are not used.

## Source and releases

Source repository: https://github.com/DavidKimbro45/Greensboro-From-The-Sky

The initial cloud release was deployed directly from an immutable public source commit. Vercel's GitHub Login Connection was not configured, so automatic Git imports were unavailable. The release build uses the public archive URL for a pinned commit, installs locked dependencies, builds, prunes development-only dependencies, then starts the production server. No GitHub token is embedded in the image.

GitHub pushes do not currently trigger Vercel redeployment. To enable that workflow, connect GitHub in the Vercel account and link this project to the repository. `Dockerfile.vercel` and `vercel.json` already select the complete Container runtime. Until then, release a new pinned source snapshot through the same cloud deployment workflow.

## Coverage

The local public feeds and map work without paid provider keys. Cloud verification checks the HTML page, health route, and county feed responses; browser checks also run against the production container at desktop and mobile sizes. The CI Production runtime job installs production dependencies only and checks the compiled UI and API routes through `npm start`.

Original optional providers retain their upstream authorization and same-site checks. Public hosting does not provision voice, photorealistic 3D, private data, or paid services. Some optional endpoints intentionally refuse forwarded requests; configuring a key alone does not change that policy. Provider credentials belong in the cloud host, and the local credential editor is disabled in production.
