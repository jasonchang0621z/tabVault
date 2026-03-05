import { storage } from 'wxt/utils/storage';
import type { Workspace, LicenseStatus, AppSettings } from './types';

export const workspacesStorage = storage.defineItem<Workspace[]>('local:workspaces', {
  fallback: [],
});

export const licenseStorage = storage.defineItem<LicenseStatus>('local:license', {
  fallback: {
    isPro: false,
    licenseKey: null,
    activatedAt: null,
  },
});

export const settingsStorage = storage.defineItem<AppSettings>('local:settings', {
  fallback: {
    lazyLoad: true,
    closeOnRestore: false,
    restoreInNewWindow: true,
    autoBackup: false,
    sortOrder: 'newest',
  },
});
