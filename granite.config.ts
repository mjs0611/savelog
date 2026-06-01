import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'savelog',
  brand: {
    displayName: 'savelog',
    primaryColor: '#3182F6',
    icon: 'https://static.toss.im/appsintoss/27829/dd14fbbc-eb70-4715-bade-ebb7c65d87d2.png',
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
