import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5180,
    host: 'localhost',
  },
  define: {
    'import.meta.env.VITE_PLATFORM': JSON.stringify(process.env.VITE_PLATFORM ?? 'ait'),
    '__BUILD_ID__': JSON.stringify(`build-${Date.now()}`),
  },
});
