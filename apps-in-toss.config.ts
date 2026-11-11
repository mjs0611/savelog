import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'savelog',

  brand: {
    primaryColor: '#216554'
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
