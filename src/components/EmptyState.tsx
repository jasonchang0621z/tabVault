import { FolderOpen } from 'lucide-react';

interface Props {
  onSave: () => void;
}

export function EmptyState({ onSave }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <FolderOpen className="w-12 h-12 text-gray-300 mb-3" />
      <p className="text-sm font-medium text-gray-500 mb-1">No workspaces yet</p>
      <p className="text-xs text-gray-400 mb-4">Save your current tabs to get started</p>
      <button
        onClick={onSave}
        className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
      >
        Save Current Tabs
      </button>
    </div>
  );
}
