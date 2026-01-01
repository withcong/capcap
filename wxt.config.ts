import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  manifest: {
    host_permissions: ['<all_urls>'],
    permissions: ['tabs', 'activeTab', 'clipboardWrite', 'downloads'],
    commands: {
      'capcap-capture': {
        description: 'Start CapCap capture',
        suggested_key: {
          default: 'Ctrl+Shift+X',
          mac: 'Command+Shift+X',
        },
      },
    },
  },
});
