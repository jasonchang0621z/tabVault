import { saveWorkspace } from '../../utils/workspace';
import { restoreWorkspace } from '../../utils/tabs';
import { settingsStorage, licenseStorage } from '../../utils/storage';
import type { Workspace } from '../../utils/types';

const AUTO_BACKUP_ALARM = 'auto-backup';

interface SaveMessage {
  type: 'SAVE_WORKSPACE';
  name: string;
}

interface RestoreMessage {
  type: 'RESTORE_WORKSPACE';
  workspace: Workspace;
  options: { lazyLoad: boolean; newWindow: boolean; closeOnRestore: boolean };
}

type Message = SaveMessage | RestoreMessage;

async function syncAutoBackupAlarm() {
  const [settings, license] = await Promise.all([
    settingsStorage.getValue(),
    licenseStorage.getValue(),
  ]);

  if (settings.autoBackup && license.isPro) {
    const existing = await chrome.alarms.get(AUTO_BACKUP_ALARM);
    if (!existing) {
      await chrome.alarms.create(AUTO_BACKUP_ALARM, { periodInMinutes: 1440 });
    }
  } else {
    await chrome.alarms.clear(AUTO_BACKUP_ALARM);
  }
}

export default defineBackground(() => {
  // Initialize auto-backup alarm on startup
  syncAutoBackupAlarm();

  // Re-sync alarm when settings or license change
  settingsStorage.watch(() => syncAutoBackupAlarm());
  licenseStorage.watch(() => syncAutoBackupAlarm());

  // Handle auto-backup alarm
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== AUTO_BACKUP_ALARM) return;

    const [settings, license] = await Promise.all([
      settingsStorage.getValue(),
      licenseStorage.getValue(),
    ]);

    if (!settings.autoBackup || !license.isPro) return;

    try {
      const now = new Date();
      const date = now.toISOString().slice(0, 10).replace(/-/g, '/');
      const time = now.toTimeString().slice(0, 5);
      const name = `Auto-backup ${date} ${time}`;
      await saveWorkspace(name, { isAutoBackup: true });
    } catch {
      // Auto-backup failure is non-critical
    }
  });

  // Handle keyboard shortcuts
  chrome.commands.onCommand.addListener(async (command) => {
    if (command === 'save-workspace') {
      try {
        const name = `Workspace ${new Date().toLocaleDateString()}`;
        await saveWorkspace(name);
      } catch (err) {
        console.error('Quick save failed:', err);
      }
    }
  });

  // Handle messages from popup
  chrome.runtime.onMessage.addListener(
    (message: Message, _sender, sendResponse) => {
      if (message.type === 'SAVE_WORKSPACE') {
        saveWorkspace(message.name)
          .then((workspace) => sendResponse({ success: true, workspace }))
          .catch((error: Error) => sendResponse({ success: false, error: error.message }));
        return true; // Keep channel open for async response
      }

      if (message.type === 'RESTORE_WORKSPACE') {
        restoreWorkspace(message.workspace, message.options)
          .then(() => sendResponse({ success: true }))
          .catch((error: Error) => sendResponse({ success: false, error: error.message }));
        return true;
      }
    },
  );
});
