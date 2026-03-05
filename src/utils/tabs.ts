import type { SavedTab, SavedTabGroup, Workspace } from './types';

/**
 * Pure function: maps Chrome tab/group objects to our saved format.
 * Extracted for testability.
 */
export function mapTabsToSavedData(
  chromeTabs: chrome.tabs.Tab[],
  chromeGroups: chrome.tabGroups.TabGroup[],
): { tabs: SavedTab[]; tabGroups: SavedTabGroup[] } {
  // Map Chrome ephemeral group IDs to stable UUIDs
  const groupIdMap = new Map<number, string>();
  const savedGroups: SavedTabGroup[] = chromeGroups.map((group) => {
    const uuid = crypto.randomUUID();
    groupIdMap.set(group.id, uuid);
    return {
      id: uuid,
      title: group.title ?? '',
      color: group.color,
      collapsed: group.collapsed,
    };
  });

  // Map tabs, translating group IDs and filtering chrome:// URLs
  const savedTabs: SavedTab[] = chromeTabs
    .filter((tab) => tab.url && !tab.url.startsWith('chrome://'))
    .map((tab) => ({
      url: tab.url!,
      title: tab.title ?? '',
      favIconUrl: tab.favIconUrl ?? '',
      pinned: tab.pinned,
      index: tab.index,
      groupId: tab.groupId !== -1 ? (groupIdMap.get(tab.groupId) ?? null) : null,
    }));

  return { tabs: savedTabs, tabGroups: savedGroups };
}

/**
 * Captures all tabs and tab groups from the current window.
 */
export async function captureCurrentWindow(): Promise<{
  tabs: SavedTab[];
  tabGroups: SavedTabGroup[];
}> {
  const chromeTabs = await chrome.tabs.query({ currentWindow: true });

  // Collect unique group IDs (excluding ungrouped tabs)
  const groupIds = [
    ...new Set(
      chromeTabs.map((t) => t.groupId).filter((id) => id !== -1),
    ),
  ];

  // Fetch group metadata
  const chromeGroups = await Promise.all(
    groupIds.map((id) => chrome.tabGroups.get(id)),
  );

  return mapTabsToSavedData(chromeTabs, chromeGroups);
}

/**
 * Restores a workspace by creating tabs and re-establishing tab groups.
 */
export async function restoreWorkspace(
  workspace: Workspace,
  options: { lazyLoad: boolean; newWindow: boolean; closeOnRestore: boolean; restoreGroups: boolean },
): Promise<void> {
  let windowId: number;
  let defaultTabId: number | undefined;
  let oldTabIds: number[] = [];

  if (options.closeOnRestore) {
    // Capture existing tab IDs before restoring so we can close them after
    const existingTabs = await chrome.tabs.query({ currentWindow: true });
    oldTabIds = existingTabs.map((t) => t.id!).filter(Boolean);
  }

  if (options.newWindow) {
    const win = await chrome.windows.create({});
    if (!win?.id) throw new Error('Failed to create window');
    windowId = win.id;
    // Chrome creates a default new tab page — we'll remove it after
    const defaultTabs = await chrome.tabs.query({ windowId });
    if (defaultTabs.length === 1 && defaultTabs[0].url === 'chrome://newtab/') {
      defaultTabId = defaultTabs[0].id;
    }
  } else {
    const currentWindow = await chrome.windows.getCurrent();
    windowId = currentWindow.id!;
  }

  // Phase 1: Create all tabs
  const createdTabIds: number[] = [];
  const groupMapping = new Map<string, number[]>();

  for (const savedTab of workspace.tabs) {
    const tab = await chrome.tabs.create({
      url: savedTab.url,
      pinned: savedTab.pinned,
      windowId,
      active: false,
    });

    createdTabIds.push(tab.id!);

    if (savedTab.groupId) {
      const existing = groupMapping.get(savedTab.groupId) ?? [];
      existing.push(tab.id!);
      groupMapping.set(savedTab.groupId, existing);
    }
  }

  // Remove the default new tab if we opened a new window
  if (defaultTabId) {
    await chrome.tabs.remove(defaultTabId);
  }

  // Phase 2: Recreate tab groups with metadata (Pro only)
  if (options.restoreGroups) {
    for (const savedGroup of workspace.tabGroups) {
      const tabIds = groupMapping.get(savedGroup.id);
      if (!tabIds || tabIds.length === 0) continue;

      const groupId = await chrome.tabs.group({
        tabIds: tabIds as [number, ...number[]],
        createProperties: { windowId },
      });

      await chrome.tabGroups.update(groupId as number, {
        title: savedGroup.title,
        color: savedGroup.color,
        collapsed: savedGroup.collapsed,
      });
    }
  }

  // Phase 3: Lazy loading — discard tabs to save memory
  if (options.lazyLoad && createdTabIds.length > 0) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    for (const tabId of createdTabIds) {
      try {
        await chrome.tabs.discard(tabId);
      } catch {
        // Active tab or already discarded — ignore
      }
    }
  }

  // Activate the first tab
  if (createdTabIds.length > 0) {
    await chrome.tabs.update(createdTabIds[0], { active: true });
  }

  // Close old tabs if closeOnRestore is enabled
  if (oldTabIds.length > 0) {
    await chrome.tabs.remove(oldTabIds);
  }
}
