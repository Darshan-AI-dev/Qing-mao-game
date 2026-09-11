/**
 * Refresh /vendor/three from the `three` devDependency.
 * The game ships the vendored copy; the npm package is only the source of truth
 * for this script, so an audit can diff vendor/ against a known release.
 */
import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = `${root}node_modules/three`;
const out = `${root}vendor/three`;

const ADDONS = [
  'loaders/GLTFLoader.js',
  'loaders/KTX2Loader.js',
  'loaders/DRACOLoader.js',
  'utils/BufferGeometryUtils.js',
  // GLTFLoader imports these; vendoring is only honest if the graph closes.
  'utils/SkeletonUtils.js',
  'libs/ktx-parse.module.js',
  'libs/zstddec.module.js'
];

await rm(out, { recursive: true, force: true });
await mkdir(`${out}/build`, { recursive: true });
await cp(`${src}/build/three.module.js`, `${out}/build/three.module.js`);
await cp(`${src}/build/three.core.js`, `${out}/build/three.core.js`);
for (const rel of ADDONS) {
  await mkdir(`${out}/addons/${rel.split('/')[0]}`, { recursive: true });
  await cp(`${src}/examples/jsm/${rel}`, `${out}/addons/${rel}`);
}
const { version } = JSON.parse(await readFile(`${src}/package.json`, 'utf8'));
await writeFile(
  `${out}/VENDORED.md`,
  `# Vendored three.js\n\nVersion: **${version}**\nRefresh with \`npm run vendor:three\`.\n\n` +
    `Only the ES module build and the addons the game imports are copied — not the\n` +
    `library's own sources, which would add several thousand files to this repository\n` +
    `for no shipping benefit. Licence: MIT, see LICENSE.\n`
);
await cp(`${src}/LICENSE`, `${out}/LICENSE`);
console.log(`vendored three ${version} -> vendor/three`);
