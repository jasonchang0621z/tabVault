import { useState } from 'react';
import type { Workspace } from '../utils/types';
import { WorkspaceCard } from './WorkspaceCard';
import { ConfirmDialog } from './ConfirmDialog';

interface Props {
  workspaces: Workspace[];
  onRestore: (workspace: Workspace) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
}

export function WorkspaceList({ workspaces, onRestore, onDelete, onRename }: Props) {
  const [deleteTarget, setDeleteTarget] = useState<Workspace | null>(null);

  return (
    <>
      <div className="flex-1 overflow-y-auto py-2">
        {workspaces.map((workspace) => (
          <WorkspaceCard
            key={workspace.id}
            workspace={workspace}
            onRestore={() => onRestore(workspace)}
            onDelete={() => setDeleteTarget(workspace)}
            onRename={(name) => onRename(workspace.id, name)}
          />
        ))}
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title="Delete workspace"
          message={`Delete "${deleteTarget.name}"? This cannot be undone.`}
          onConfirm={() => {
            onDelete(deleteTarget.id);
            setDeleteTarget(null);
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
  );
}
