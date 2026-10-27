import { constants, realpathSync } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import { isIP } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv, preview } from 'vite';
import { DEFAULT_ALLOWED_HOSTS } from '../../build/allowedHosts.js';

export const PRODUCTION_ROOT = realpathSync(
  fileURLToPath(new URL('../../', import.meta.url)),
);

const PLATFORM_HOST_VARIABLES = Object.freeze([
  'VERCEL_URL',
  'VERCEL_BRANCH_URL',
  'VERCEL_PROJECT_PRODUCTION_URL',
  'RENDER_EXTERNAL_HOSTNAME',
]);

/** Accept one exact hostname or address, never a URL, port, or wildcard. */
function exactHost(value, variable, { bind = false } = {}) {
  const host = String(value).trim().toLowerCase();
  if (isIP(host)) return host;
  if (
    !host ||
    host.length > 253 ||
    !host
      .split('.')
      .every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
  ) {
    throw new Error(
      `${variable} must contain ${bind ? 'a hostname or IP address' : 'an exact hostname or IP address'}, without a scheme, port, path, or wildcard.`,
    );
  }
  return host;
}

/** Resolve hosting settings without changing the process environment. */
export function resolveProductionOptions(env = process.env) {
  const rawPort = String(env.PORT ?? '').trim();
  const port = rawPort === '' ? 8080 : Number(rawPort);
  if (
    (rawPort !== '' && !/^\d+$/.test(rawPort)) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  const host = exactHost(String(env.HOST ?? '').trim() || '0.0.0.0', 'HOST', {
    bind: true,
  });
  const allowedHosts = [...DEFAULT_ALLOWED_HOSTS];
  for (const configured of String(env.GEV_ALLOWED_HOSTS ?? '').split(',')) {
    if (configured.trim())
      allowedHosts.push(exactHost(configured, 'GEV_ALLOWED_HOSTS'));
  }
  for (const variable of PLATFORM_HOST_VARIABLES) {
    if (String(env[variable] ?? '').trim())
      allowedHosts.push(exactHost(env[variable], variable));
  }
  return { host, port, allowedHosts: [...new Set(allowedHosts)] };
}

/** Readiness reports this server only; providers need no keys or network call. */
export function productionReadinessPlugin() {
  return {
    name: 'production-readiness',
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        let pathname;
        try {
          pathname = new URL(req.url || '/', 'http://localhost').pathname;
        } catch {
          return next();
        }
        if (pathname !== '/healthz') return next();
        const permitted = req.method === 'GET' || req.method === 'HEAD';
        const body = JSON.stringify(
          permitted ? { status: 'ok' } : { error: 'Method not allowed' },
        );
        res.statusCode = permitted ? 200 : 405;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Length', Buffer.byteLength(body));
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        if (!permitted) res.setHeader('Allow', 'GET, HEAD');
        res.end(req.method === 'HEAD' ? undefined : body);
      });
    },
  };
}

/**
 * Serve the built UI with the checkout's existing provider preview hooks.
 * Explicitly require the build: Vite skips its missing-dist check when preview
 * plugins exist, which can otherwise leave an API-only process looking ready.
 */
export async function startProductionServer({
  root = PRODUCTION_ROOT,
  env = process.env,
  previewImpl = preview,
  loadEnvImpl = loadEnv,
} = {}) {
  const canonicalRoot = realpathSync(root);
  const indexFile = path.join(canonicalRoot, 'dist', 'index.html');
  try {
    if (!(await stat(indexFile)).isFile()) throw new Error('Not a file');
    await access(indexFile, constants.R_OK);
  } catch (cause) {
    throw new Error(
      'Production build is missing or unreadable. Run npm run build before npm start.',
      { cause },
    );
  }
  // Match the root config's production dotenv mode, with explicit environment
  // values taking precedence. The config still owns loading provider secrets.
  const loaded = loadEnvImpl('production', canonicalRoot, '');
  const options = resolveProductionOptions({ ...loaded, ...env });
  return previewImpl({
    root: canonicalRoot,
    configFile: path.join(canonicalRoot, 'vite.config.js'),
    mode: 'production',
    plugins: [productionReadinessPlugin()],
    preview: { ...options, strictPort: true },
  });
}
