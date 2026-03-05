import { useState } from 'react';
import { Save, Loader2, Settings } from 'lucide-react';
import { useWorkspaces } from '../../hooks/useWorkspaces';
import { useSearch } from '../../hooks/useSearch';
import { useSettings } from '../../hooks/useSettings';
import { useToast } from '../../hooks/useToast';
import { sortWorkspaces } from '../../utils/workspace';
import { exportWorkspaces, importWorkspaces, mergeWorkspaces } from '../../utils/export';
import { workspacesStorage } from '../../utils/storage';
import { WorkspaceList } from '../../components/WorkspaceList';
import { SearchBar } from '../../components/SearchBar';
import { EmptyState } from '../../components/EmptyState';
import { SaveWorkspaceDialog } from '../../components/SaveWorkspaceDialog';
import { SettingsPanel } from '../../components/SettingsPanel';
import { ProBadge } from '../../components/ProBadge';
import { ProActivationDialog } from '../../components/ProActivationDialog';
import { Toast } from '../../components/Toast';

export default function App() {
  const { workspaces, loading, save, restore, remove, rename, isPro, canSave, count, limit } =
    useWorkspaces();
  const { settings, updateSetting } = useSettings();
  const { query, setQuery, filtered: searchFiltered } = useSearch(workspaces);
  const filtered = sortWorkspaces(searchFiltered, settings.sortOrder);
  const { toast, showToast, dismissToast } = useToast();
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showProDialog, setShowProDialog] = useState(false);

  const handleSave = async (name: string) => {
    try {
      await save(name);
      setShowSaveDialog(false);
      showToast('Workspace saved');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save', 'error');
    }
  };

  const handleRestore = async (workspace: ReturnType<typeof useWorkspaces>['workspaces'][0]) => {
    try {
      await restore(workspace);
      showToast(`Restored ${workspace.tabCount} tabs`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to restore', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await remove(id);
      showToast('Workspace deleted');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to delete', 'error');
    }
  };

  const handleRename = async (id: string, name: string) => {
    try {
      await rename(id, name);
      showToast('Workspace renamed');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to rename', 'error');
    }
  };

  const handleExport = () => {
    exportWorkspaces(workspaces);
    showToast(`Exported ${workspaces.length} workspaces`);
  };

  const handleImport = async (file: File) => {
    try {
      const imported = await importWorkspaces(file);
      const merged = mergeWorkspaces(workspaces, imported);
      await workspacesStorage.setValue(merged);
      const added = merged.length - workspaces.length;
      showToast(`Imported ${added} new workspace${added !== 1 ? 's' : ''}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to import', 'error');
    }
  };

  if (loading) {
    return (
      <div className="w-[380px] h-[300px] flex items-center justify-center bg-white">
        <Loader2 className="w-6 h-6 text-gray-300 animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-[380px] min-h-[200px] max-h-[500px] flex flex-col bg-white">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h1 className="text-base font-semibold text-gray-900">TabVault</h1>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowSettings(true)}
            className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowSaveDialog(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            Save Current
          </button>
        </div>
      </header>

      {/* Content */}
      {showSettings ? (
        <SettingsPanel
          settings={settings}
          onUpdate={updateSetting}
          onBack={() => setShowSettings(false)}
          isPro={isPro}
          onExport={handleExport}
          onImport={handleImport}
        />
      ) : workspaces.length === 0 ? (
        <EmptyState onSave={() => setShowSaveDialog(true)} />
      ) : (
        <>
          <SearchBar query={query} onChange={setQuery} />
          {filtered.length === 0 ? (
            <div className="flex-1 flex items-center justify-center py-8">
              <p className="text-xs text-gray-400">No matching workspaces</p>
            </div>
          ) : (
            <WorkspaceList
              workspaces={filtered}
              onRestore={handleRestore}
              onDelete={handleDelete}
              onRename={handleRename}
            />
          )}
        </>
      )}

      {/* Footer */}
      <ProBadge count={count} limit={limit} onUnlockPro={() => setShowProDialog(true)} />

      {/* Dialogs */}
      {showSaveDialog && (
        <SaveWorkspaceDialog
          onSave={handleSave}
          onCancel={() => setShowSaveDialog(false)}
          canSave={canSave}
        />
      )}

      {/* Pro Activation */}
      {showProDialog && (
        <ProActivationDialog
          onActivated={() => {
            setShowProDialog(false);
            showToast('Pro activated! Enjoy unlimited workspaces.');
          }}
          onCancel={() => setShowProDialog(false)}
        />
      )}

      {/* Toast */}
      {toast && <Toast toast={toast} onDismiss={dismissToast} />}
    </div>
  );
}
