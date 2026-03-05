import { useState, useEffect, useCallback } from 'react';
import type { WxtStorageItem } from 'wxt/utils/storage';

export function useStorageItem<T>(item: WxtStorageItem<T, Record<string, unknown>>) {
  const [value, setValue] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    item.getValue().then((v) => {
      setValue(v);
      setLoading(false);
    });

    const unwatch = item.watch((newValue) => {
      setValue(newValue);
    });

    return unwatch;
  }, []);

  const update = useCallback(async (newValue: T) => {
    await item.setValue(newValue);
  }, []);

  return { value, loading, update } as const;
}
