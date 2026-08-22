import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

import aitDevtools from "@apps-in-toss/devtools/unplugin";

export default defineConfig({
  plugins: [aitDevtools.vite(), ((react as any).default || react)()],
  base: './',
  css: {
    postcss: {},
  },
  server: {
    port: 5180,
    host: 'localhost',
  },
  define: {
    'import.meta.env.VITE_PLATFORM': JSON.stringify(process.env.VITE_PLATFORM ?? 'ait'),
    '__BUILD_ID__': JSON.stringify(`build-${Date.now()}`),
  },
});
