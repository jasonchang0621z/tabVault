/** A single saved tab within a workspace */
export interface SavedTab {
  url: string;
  title: string;
  favIconUrl: string;
  pinned: boolean;
  index: number;
  /** References SavedTabGroup.id (UUID), null if ungrouped */
  groupId: string | null;
}

/** Chrome tab group metadata */
export interface SavedTabGroup {
  /** Stable UUID (not Chrome's ephemeral groupId) */
  id: string;
  title: string;
  color: `${chrome.tabGroups.Color}`;
  collapsed: boolean;
}

/** A complete workspace snapshot */
export interface Workspace {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  tabs: SavedTab[];
  tabGroups: SavedTabGroup[];
  /** Denormalized for list display */
  tabCount: number;
  /** True if created by auto-backup */
  isAutoBackup?: boolean;
}

/** Pro license status */
export interface LicenseStatus {
  isPro: boolean;
  licenseKey: string | null;
  activatedAt: string | null;
}

/** App settings */
export interface AppSettings {
  lazyLoad: boolean;
  closeOnRestore: boolean;
  restoreInNewWindow: boolean;
  autoBackup: boolean;
  sortOrder: 'newest' | 'oldest' | 'alphabetical';
}
