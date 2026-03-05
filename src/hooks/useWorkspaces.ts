import { useStorageItem } from './useStorageItem';
import { workspacesStorage, licenseStorage, settingsStorage } from '../utils/storage';
import { deleteWorkspace, updateWorkspaceName } from '../utils/workspace';
import type { Workspace } from '../utils/types';
import { FREE_WORKSPACE_LIMIT } from '../utils/constants';

export function useWorkspaces() {
  const { value: workspaces, loading } = useStorageItem(workspacesStorage);
  const { value: license } = useStorageItem(licenseStorage);
  const { value: settings } = useStorageItem(settingsStorage);

  const save = async (name: string) => {
    const response = await chrome.runtime.sendMessage({
      type: 'SAVE_WORKSPACE',
      name,
    });
    if (!response.success) throw new Error(response.error);
    return response.workspace as Workspace;
  };

  const isPro = license?.isPro ?? false;

  const restore = async (workspace: Workspace, lazyLoad = true) => {
    const closeOnRestore = settings?.closeOnRestore ?? false;
    const newWindow = settings?.restoreInNewWindow ?? true;
    const response = await chrome.runtime.sendMessage({
      type: 'RESTORE_WORKSPACE',
      workspace,
      options: {
        lazyLoad,
        newWindow,
        closeOnRestore,
        restoreGroups: isPro,
      },
    });
    if (!response.success) throw new Error(response.error);
  };

  const remove = async (id: string) => {
    await deleteWorkspace(id);
  };

  const rename = async (id: string, name: string) => {
    await updateWorkspaceName(id, name);
  };

  const limit = isPro ? Infinity : FREE_WORKSPACE_LIMIT;
  const canSave = (workspaces?.length ?? 0) < limit;

  return {
    workspaces: workspaces ?? [],
    loading,
    save,
    restore,
    remove,
    rename,
    isPro,
    canSave,
    count: workspaces?.length ?? 0,
    limit: isPro ? null : FREE_WORKSPACE_LIMIT,
  };
}
