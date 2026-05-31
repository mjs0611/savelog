import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'savelog',
  brand: {
    displayName: 'savelog',
    primaryColor: '#3182F6',
    icon: '/images/app_icon.png',
  },
  web: {
    host: 'localhost',
    port: 5180,
    commands: {
      dev: 'vite',
      build: 'node scripts/build.mjs',
    },
  },
  navigationBar: {
    withBackButton: false,
    withHomeButton: true,
  },
  webViewProps: {
    type: 'partner',
    bounces: false,
    pullToRefreshEnabled: false,
  },
  permissions: [],
});
