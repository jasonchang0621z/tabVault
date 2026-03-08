import { workspacesStorage, licenseStorage } from './storage';
import { captureCurrentWindow } from './tabs';
import { FREE_WORKSPACE_LIMIT } from './constants';
import type { Workspace } from './types';

export async function saveWorkspace(name: string, options?: { isAutoBackup?: boolean }): Promise<Workspace> {
  const [workspaces, license] = await Promise.all([
    workspacesStorage.getValue(),
    licenseStorage.getValue(),
  ]);

  const limit = license.isPro ? Infinity : FREE_WORKSPACE_LIMIT;
  if (workspaces.length >= limit) {
    throw new Error(`Free tier limited to ${FREE_WORKSPACE_LIMIT} workspaces. Upgrade to Pro for unlimited.`);
  }

  const { tabs, tabGroups } = await captureCurrentWindow();
  const now = new Date().toISOString();

  // For auto-backups, keep up to MAX_AUTO_BACKUPS and rotate out the oldest
  const MAX_AUTO_BACKUPS = 3;
  if (options?.isAutoBackup) {
    const autoBackups = workspaces.filter((w) => w.isAutoBackup);
    if (autoBackups.length >= MAX_AUTO_BACKUPS) {
      // Remove oldest auto-backups to stay within limit
      const sorted = autoBackups.sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      const toRemove = sorted.slice(0, autoBackups.length - MAX_AUTO_BACKUPS + 1);
      const removeIds = new Set(toRemove.map((w) => w.id));
      const filtered = workspaces.filter((w) => !removeIds.has(w.id));
      await workspacesStorage.setValue(filtered);
      // Re-read so the new workspace is appended to the cleaned list
      workspaces.splice(0, workspaces.length, ...filtered);
    }
  }

  const workspace: Workspace = {
    id: crypto.randomUUID(),
    name,
    createdAt: now,
    updatedAt: now,
    tabs,
    tabGroups,
    tabCount: tabs.length,
    ...(options?.isAutoBackup ? { isAutoBackup: true } : {}),
  };

  await workspacesStorage.setValue([workspace, ...workspaces]);
  return workspace;
}

export async function deleteWorkspace(id: string): Promise<void> {
  const workspaces = await workspacesStorage.getValue();
  await workspacesStorage.setValue(workspaces.filter((w) => w.id !== id));
}

export async function updateWorkspaceName(id: string, name: string): Promise<void> {
  const workspaces = await workspacesStorage.getValue();
  const index = workspaces.findIndex((w) => w.id === id);
  if (index === -1) return;

  workspaces[index] = {
    ...workspaces[index],
    name,
    updatedAt: new Date().toISOString(),
  };
  await workspacesStorage.setValue(workspaces);
}

/** Sort workspaces by the given order */
export function sortWorkspaces(
  workspaces: Workspace[],
  order: 'newest' | 'oldest' | 'alphabetical',
): Workspace[] {
  const sorted = [...workspaces];
  switch (order) {
    case 'newest':
      return sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    case 'oldest':
      return sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    case 'alphabetical':
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
  }
}

/** Client-side workspace search — filters by name, tab title, or URL */
export function filterWorkspaces(workspaces: Workspace[], query: string): Workspace[] {
  const q = query.trim().toLowerCase();
  if (!q) return workspaces;

  return workspaces.filter((w) => {
    if (w.name.toLowerCase().includes(q)) return true;
    return w.tabs.some(
      (t) => t.title.toLowerCase().includes(q) || t.url.toLowerCase().includes(q),
    );
  });
}
