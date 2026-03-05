import { useState, useRef, useEffect } from 'react';
import { RotateCcw, Trash2, ChevronDown, ChevronRight, Pencil } from 'lucide-react';
import type { Workspace, SavedTabGroup } from '../utils/types';
import { TabGroupBadge } from './TabGroupBadge';
import { TabItem } from './TabItem';

interface Props {
  workspace: Workspace;
  onRestore: () => void;
  onDelete: () => void;
  onRename: (name: string) => void;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export function WorkspaceCard({ workspace, onRestore, onDelete, onRename }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(workspace.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const submitRename = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== workspace.name) {
      onRename(trimmed);
    }
    setEditing(false);
  };

  // Group tabs by their group ID for the expanded view
  const groupMap = new Map<string, SavedTabGroup>();
  workspace.tabGroups.forEach((g) => groupMap.set(g.id, g));

  return (
    <div className="border border-gray-100 rounded-lg mx-3 mb-2 overflow-hidden">
      {/* Card header — clickable to expand */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-3 py-2.5 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {expanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            )}
            {editing ? (
              <input
                ref={inputRef}
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={submitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitRename();
                  if (e.key === 'Escape') {
                    setEditName(workspace.name);
                    setEditing(false);
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                className="text-sm font-medium text-gray-900 bg-white border border-blue-400 rounded px-1 py-0 outline-none min-w-0 flex-1"
              />
            ) : (
              <>
                <span className="text-sm font-medium text-gray-900 truncate">
                  {workspace.name}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditName(workspace.name);
                    setEditing(true);
                  }}
                  className="p-0.5 text-gray-300 hover:text-gray-500 transition-colors flex-shrink-0"
                  title="Rename"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              </>
            )}
          </div>
          <span className="text-[10px] text-gray-400 flex-shrink-0 pt-0.5">
            {workspace.tabCount} tabs
          </span>
        </div>

        <div className="flex items-center gap-2 mt-1.5 ml-5">
          {workspace.tabGroups.length > 0 && (
            <div className="flex gap-1">
              {workspace.tabGroups.map((group) => (
                <TabGroupBadge key={group.id} color={group.color} title={group.title} />
              ))}
            </div>
          )}
          <span className="text-[10px] text-gray-400 ml-auto">
            {timeAgo(workspace.createdAt)}
          </span>
        </div>
      </button>

      {/* Action buttons */}
      <div className="flex border-t border-gray-100">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRestore();
          }}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 transition-colors"
        >
          <RotateCcw className="w-3 h-3" />
          Restore
        </button>
        <div className="w-px bg-gray-100" />
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="flex items-center justify-center px-3 py-1.5 text-xs text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {/* Expanded tab list */}
      {expanded && (
        <div className="border-t border-gray-100 max-h-[200px] overflow-y-auto bg-gray-50/50">
          {workspace.tabs.map((tab, i) => {
            const group = tab.groupId ? groupMap.get(tab.groupId) : null;
            const prevTab = workspace.tabs[i - 1];
            const showGroupHeader =
              group && (!prevTab || prevTab.groupId !== tab.groupId);

            return (
              <div key={`${tab.url}-${i}`}>
                {showGroupHeader && (
                  <div className="px-3 pt-2 pb-0.5">
                    <TabGroupBadge color={group.color} title={group.title} />
                  </div>
                )}
                <div className={group ? 'pl-2' : ''}>
                  <TabItem tab={tab} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
