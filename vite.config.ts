import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// three.js is vendored under /vendor/three so the shipped build contains no CDN
// reference and the offline ZIP keeps working from file://. `npm run vendor:three`
// refreshes the copy from the devDependency.
export default defineConfig({
  base: './',
  resolve: {
    alias: [
      { find: /^three\/addons\/(.*)$/, replacement: here('./vendor/three/addons/$1') },
      { find: /^three$/, replacement: here('./vendor/three/build/three.module.js') },
      { find: '@engine', replacement: here('./engine') },
      { find: '@canon', replacement: here('./canon') },
      { find: '@content', replacement: here('./content/qingmao') }
    ]
  },
  build: {
    target: 'es2022',
    assetsInlineLimit: 2048,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // Act packs split so the first playable moment stays under the 10 MB budget.
        manualChunks(id) {
          if (id.includes('vendor/three')) return 'three';
          if (id.includes('/content/qingmao/acts/act2')) return 'act2';
          if (id.includes('/content/qingmao/acts/act3')) return 'act3';
          if (id.includes('/content/qingmao/acts/act4')) return 'act4';
          return undefined;
        }
      }
    }
  },
  server: { host: '127.0.0.1', port: 5173 }
});
