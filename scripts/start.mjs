#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { startProductionServer } from '../server/standalone/production.js';
import { isDirectInvocation } from './pinokio-install.mjs';

/** The executable owns process signals; importing the server installs none. */
export async function runProductionCli({
  startServer = startProductionServer,
  runtime = process,
  logger = console,
} = {}) {
  let server;
  try {
    server = await startServer();
  } catch (error) {
    logger.error(`[Server] Start refused: ${error.message}`);
    runtime.exitCode = 1;
    return null;
  }
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      await server.close();
      runtime.exit(0);
    } catch (error) {
      logger.error(`[Server] Shutdown failed: ${error.message}`);
      runtime.exit(1);
    }
  };
  for (const signal of ['SIGTERM', 'SIGINT']) runtime.once(signal, shutdown);
  server.printUrls();
  logger.log('[Server] Production application is ready.');
  return server;
}

if (isDirectInvocation(process.argv[1], fileURLToPath(import.meta.url))) {
  // Root resolution belongs to production.js and is independent of this cwd.
  runProductionCli();
}
