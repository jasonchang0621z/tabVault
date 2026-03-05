import type { Workspace } from './types';

function isValidWorkspace(w: unknown): w is Workspace {
  if (typeof w !== 'object' || w === null) return false;
  const obj = w as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.createdAt === 'string' &&
    typeof obj.updatedAt === 'string' &&
    Array.isArray(obj.tabs) &&
    Array.isArray(obj.tabGroups) &&
    typeof obj.tabCount === 'number'
  );
}

export function validateWorkspaces(data: unknown): Workspace[] {
  if (!Array.isArray(data)) {
    throw new Error('Invalid format: expected an array of workspaces');
  }
  for (let i = 0; i < data.length; i++) {
    if (!isValidWorkspace(data[i])) {
      throw new Error(`Invalid workspace at index ${i}`);
    }
  }
  return data as Workspace[];
}

export function mergeWorkspaces(existing: Workspace[], imported: Workspace[]): Workspace[] {
  const existingIds = new Set(existing.map((w) => w.id));
  const newWorkspaces = imported.filter((w) => !existingIds.has(w.id));
  return [...existing, ...newWorkspaces];
}

export function exportWorkspaces(workspaces: Workspace[]): void {
  const json = JSON.stringify(workspaces, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tabvault-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importWorkspaces(file: File): Promise<Workspace[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        const workspaces = validateWorkspaces(data);
        resolve(workspaces);
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Failed to parse file'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}
