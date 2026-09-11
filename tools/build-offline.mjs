/**
 * Builds the offline ZIP for desktop players.
 *
 * Service workers do not run from file://, so this build drops the worker and the
 * PWA manifest and keeps plain script loading. Vite already emits relative URLs
 * (`base: './'`), so the output opens by double-clicking index.html.
 *
 * Source PDFs are never included. The previous starter bundled the chapter PDFs,
 * which should not ship with a public build at all.
 */
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRaw } from 'node:zlib';
import { promisify } from 'node:util';

const deflate = promisify(deflateRaw);
const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
const staging = join(root, 'dist-offline');
const zipPath = join(root, 'Qing-Mao-Rebirth-offline.zip');

/** Anything matching these never enters a shipped bundle. */
const NEVER_SHIP = [/\.pdf$/i, /source-reference/i, /\.map$/];

async function walk(dir, base = dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full, base)));
    else out.push({ full, rel: relative(base, full).split('\\').join('/') });
  }
  return out;
}

await stat(dist).catch(() => {
  throw new Error('Run `vite build` before `build-offline`.');
});

await rm(staging, { recursive: true, force: true });
await mkdir(staging, { recursive: true });
await cp(dist, staging, { recursive: true });

// The worker and the manifest are hosted-build only.
await rm(join(staging, 'sw.js'), { force: true });
await rm(join(staging, 'manifest.webmanifest'), { force: true });

let html = await readFile(join(staging, 'index.html'), 'utf8');
html = html
  .replace(/\s*<link rel="manifest"[^>]*>/, '')
  .replace(/<script>\s*\/\/ Registered only for the hosted build[\s\S]*?<\/script>/, '')
  .replace('</body>', '<!-- Offline build: no service worker, no manifest. Open index.html directly. -->\n</body>');
await writeFile(join(staging, 'index.html'), html);

await writeFile(join(staging, 'READ-ME-FIRST.txt'),
  'Qing Mao · Rebirth — offline build\n\n' +
  'Open index.html in Chrome, Edge, Firefox or Safari. It needs WebGL2, which every\n' +
  'current browser has.\n\n' +
  'This build has no service worker, because service workers cannot run from a local\n' +
  'file. Everything else is identical to the hosted version. Progress is saved in your\n' +
  "browser's storage for this file location, so keep the folder where it is.\n\n" +
  'All dialogue and ledger entries are original writing. No source text is included.\n');

const files = (await walk(staging)).filter(({ rel }) => !NEVER_SHIP.some((p) => p.test(rel)));

// A minimal ZIP writer: one deflated entry per file, no dependencies.
const chunks = [];
const central = [];
let offset = 0;
const encoder = new TextEncoder();

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

for (const { full, rel } of files) {
  const data = await readFile(full);
  const compressed = await deflate(data, { level: 9 });
  const name = encoder.encode(rel);
  const crc = crc32(data);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(0, 10);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  chunks.push(local, Buffer.from(name), compressed);

  const entry = Buffer.alloc(46);
  entry.writeUInt32LE(0x02014b50, 0);
  entry.writeUInt16LE(20, 4);
  entry.writeUInt16LE(20, 6);
  entry.writeUInt16LE(8, 8);
  entry.writeUInt32LE(crc, 16);
  entry.writeUInt32LE(compressed.length, 20);
  entry.writeUInt32LE(data.length, 24);
  entry.writeUInt16LE(name.length, 28);
  entry.writeUInt32LE(offset, 42);
  central.push(entry, Buffer.from(name));

  offset += local.length + name.length + compressed.length;
}

const centralBuf = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralBuf.length, 12);
end.writeUInt32LE(offset, 16);

await new Promise((resolve, reject) => {
  const out = createWriteStream(zipPath);
  out.on('error', reject);
  out.on('close', resolve);
  for (const chunk of chunks) out.write(chunk);
  out.write(centralBuf);
  out.write(end);
  out.end();
});

const { size } = await stat(zipPath);
console.log(`offline build: ${files.length} files -> ${zipPath} (${(size / 1e6).toFixed(2)} MB)`);
