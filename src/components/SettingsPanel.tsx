import { useRef } from 'react';
import { ArrowLeft, Download, Upload } from 'lucide-react';
import type { AppSettings, Workspace } from '../utils/types';

interface Props {
  settings: AppSettings;
  onUpdate: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  onBack: () => void;
  isPro: boolean;
  onExport: () => void;
  onImport: (file: File) => void;
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between py-3 cursor-pointer">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full transition-colors ${
          checked ? 'bg-blue-600' : 'bg-gray-200'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform mt-0.5 ${
            checked ? 'translate-x-4 ml-0.5' : 'translate-x-0 ml-0.5'
          }`}
        />
      </button>
    </label>
  );
}

const SORT_OPTIONS: { value: AppSettings['sortOrder']; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'alphabetical', label: 'Alphabetical' },
];

export function SettingsPanel({ settings, onUpdate, onBack, isPro, onExport, onImport }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
        <button
          onClick={onBack}
          className="p-0.5 -ml-1 text-gray-500 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h2 className="text-sm font-semibold text-gray-900">Settings</h2>
      </div>

      {/* Settings list */}
      <div className="px-4 divide-y divide-gray-100">
        <Toggle
          label="Lazy load tabs"
          description="Only load tabs when activated"
          checked={settings.lazyLoad}
          onChange={(v) => onUpdate('lazyLoad', v)}
        />
        <Toggle
          label="Restore in new window"
          description="Open restored workspace in a new window"
          checked={settings.restoreInNewWindow}
          onChange={(v) => onUpdate('restoreInNewWindow', v)}
        />
        <Toggle
          label="Close tabs on restore"
          description="Close current tabs when restoring a workspace"
          checked={settings.closeOnRestore}
          onChange={(v) => onUpdate('closeOnRestore', v)}
        />

        <div className="py-3">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900">Auto backup</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {isPro ? 'Automatically save workspace daily' : 'Pro feature — upgrade to enable'}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.autoBackup}
              disabled={!isPro}
              onClick={() => onUpdate('autoBackup', !settings.autoBackup)}
              className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                settings.autoBackup ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform mt-0.5 ${
                  settings.autoBackup ? 'translate-x-4 ml-0.5' : 'translate-x-0 ml-0.5'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Sort order */}
        <div className="py-3">
          <p className="text-sm font-medium text-gray-900">Sort order</p>
          <p className="text-xs text-gray-500 mt-0.5">How workspaces are listed</p>
          <select
            value={settings.sortOrder}
            onChange={(e) =>
              onUpdate('sortOrder', e.target.value as AppSettings['sortOrder'])
            }
            className="mt-2 w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Export / Import */}
        <div className="py-3">
          <p className="text-sm font-medium text-gray-900">Data</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {isPro ? 'Export or import workspaces as JSON' : 'Pro feature — upgrade to export/import'}
          </p>
          <div className="flex gap-2 mt-2">
            <button
              onClick={onExport}
              disabled={!isPro}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={!isPro}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              Import
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onImport(file);
                e.target.value = '';
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
