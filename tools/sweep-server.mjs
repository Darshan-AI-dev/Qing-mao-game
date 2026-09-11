/**
 * The preview server a sweep runs against, started and stopped by the sweep itself.
 *
 * Leaving one behind blocks the Playwright suite, which no longer reuses an existing
 * server — and a server left over from an older build silently serves stale code,
 * which cost three rounds of debugging before anyone noticed.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

let server = null;

export async function startServer(url, enabled = true) {
  if (!enabled) return;
  // The vite binary directly rather than through npx: with npx in between the server
  // is a grandchild and survives a signal aimed at the handle we hold.
  server = spawn(
    fileURLToPath(new URL('../node_modules/.bin/vite', import.meta.url)),
    ['preview', '--port', '4173', '--strictPort'],
    { stdio: 'ignore', detached: true }
  );
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('preview server did not come up');
}

export function stopServer() {
  if (!server) return;
  const { pid } = server;
  server = null;
  // SIGKILL, not SIGTERM: this also runs from an exit handler, which cannot wait for a
  // graceful shutdown, and a server left running blocks the next Playwright run. The
  // group is signalled first because the process is detached.
  for (const target of [-pid, pid]) {
    try {
      process.kill(target, 'SIGKILL');
    } catch {
      /* already gone, or not a group leader */
    }
  }
}

process.on('exit', stopServer);
process.on('SIGINT', () => { stopServer(); process.exit(130); });
