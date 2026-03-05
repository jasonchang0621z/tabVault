import { useStorageItem } from './useStorageItem';
import { settingsStorage } from '../utils/storage';
import type { AppSettings } from '../utils/types';

export function useSettings() {
  const { value: settings, loading, update } = useStorageItem(settingsStorage);

  const updateSetting = async <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ) => {
    const current = settings ?? { lazyLoad: true, closeOnRestore: false, restoreInNewWindow: true, autoBackup: false, sortOrder: 'newest' as const };
    await update({ ...current, [key]: value });
  };

  return {
    settings: settings ?? { lazyLoad: true, closeOnRestore: false, restoreInNewWindow: true, autoBackup: false, sortOrder: 'newest' as const },
    loading,
    updateSetting,
  };
}
