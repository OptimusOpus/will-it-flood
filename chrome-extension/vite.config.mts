import manifest from './manifest';
import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const popup = resolve(projectRoot, 'pages/popup');

export default defineConfig({
  root: popup,
  base: './',
  publicDir: resolve(import.meta.dirname, 'public'),
  resolve: { alias: { '@src': resolve(popup, 'src') } },
  plugins: [
    {
      name: 'extension-manifest',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'manifest.json', source: JSON.stringify(manifest, null, 2) });
      },
    },
  ],
  build: { outDir: resolve(projectRoot, 'dist'), emptyOutDir: true },
});
