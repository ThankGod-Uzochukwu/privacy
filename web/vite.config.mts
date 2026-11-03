import react from '@vitejs/plugin-react';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

// React Native code runs on the web through react-native-web. Platform
// extensions mirror Metro's: `Foo.web.ts` wins over `Foo.ts`.
export default defineConfig(({mode}) => ({
  root: here,
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      'react-native': 'react-native-web',
      '@': path.resolve(root, 'src'),
    },
    extensions: ['.web.tsx', '.web.ts', '.web.js', '.tsx', '.ts', '.js', '.json'],
  },
  define: {
    __DEV__: JSON.stringify(mode !== 'production'),
    global: 'globalThis',
  },
  server: {port: 5173, strictPort: true, fs: {allow: [root]}},
  build: {
    outDir: path.resolve(root, 'dist', 'web'),
    emptyOutDir: true,
    target: 'chrome120', // Electron's Chromium; no legacy transforms needed
    sourcemap: false,
  },
}));
