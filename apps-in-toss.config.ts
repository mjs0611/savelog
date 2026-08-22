import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'savelog',

  brand: {
    primaryColor: '#E14B3B'
  },

  navigationBar: {
    withBackButton: false,
    withHomeButton: true,
  },

  webView: {
    bounces: false,
    pullToRefreshEnabled: false
  },

  webBundleDir: 'dist',


  permissions: []
});
