import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'TabVault',
    short_name: 'TabVault',
    description: 'Save and restore tab workspaces with Chrome native tab groups',
    version: '1.0.0',
    minimum_chrome_version: '116',
    homepage_url: 'https://github.com/jasonchang0621z/tabVault',
    permissions: ['tabs', 'tabGroups', 'storage', 'alarms'],
    icons: {
      16: 'icon-16.png',
      32: 'icon-32.png',
      48: 'icon-48.png',
      128: 'icon-128.png',
    },
    commands: {
      '_execute_action': {
        suggested_key: { default: 'Alt+T' },
        description: 'Open TabVault popup',
      },
      'save-workspace': {
        suggested_key: { default: 'Alt+S' },
        description: 'Save current tabs as workspace',
      },
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
