import { describe, it, expect } from 'vitest';
import { mapTabsToSavedData } from '../../utils/tabs';

describe('mapTabsToSavedData', () => {
  it('maps tabs and groups correctly', () => {
    const chromeTabs = [
      { id: 1, url: 'https://example.com', title: 'Example', favIconUrl: 'https://example.com/fav.ico', pinned: false, index: 0, groupId: 100 },
      { id: 2, url: 'https://google.com', title: 'Google', favIconUrl: '', pinned: true, index: 1, groupId: -1 },
    ] as chrome.tabs.Tab[];

    const chromeGroups = [
      { id: 100, title: 'Work', color: 'blue' as const, collapsed: false, windowId: 1, shared: false },
    ] as chrome.tabGroups.TabGroup[];

    const { tabs, tabGroups } = mapTabsToSavedData(chromeTabs, chromeGroups);

    expect(tabGroups).toHaveLength(1);
    expect(tabGroups[0].title).toBe('Work');
    expect(tabGroups[0].color).toBe('blue');

    expect(tabs).toHaveLength(2);
    expect(tabs[0].groupId).toBe(tabGroups[0].id);
    expect(tabs[1].groupId).toBeNull();
    expect(tabs[1].pinned).toBe(true);
  });

  it('filters out chrome:// URLs', () => {
    const chromeTabs = [
      { id: 1, url: 'chrome://newtab/', title: 'New Tab', favIconUrl: '', pinned: false, index: 0, groupId: -1 },
      { id: 2, url: 'https://example.com', title: 'Example', favIconUrl: '', pinned: false, index: 1, groupId: -1 },
    ] as chrome.tabs.Tab[];

    const { tabs } = mapTabsToSavedData(chromeTabs, []);
    expect(tabs).toHaveLength(1);
    expect(tabs[0].url).toBe('https://example.com');
  });

  it('handles empty input', () => {
    const { tabs, tabGroups } = mapTabsToSavedData([], []);
    expect(tabs).toHaveLength(0);
    expect(tabGroups).toHaveLength(0);
  });

  it('handles tabs with no URL', () => {
    const chromeTabs = [
      { id: 1, url: undefined, title: 'Loading...', favIconUrl: '', pinned: false, index: 0, groupId: -1 },
    ] as unknown as chrome.tabs.Tab[];

    const { tabs } = mapTabsToSavedData(chromeTabs, []);
    expect(tabs).toHaveLength(0);
  });
});
