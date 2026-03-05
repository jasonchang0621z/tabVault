import { useState, useMemo } from 'react';
import { filterWorkspaces } from '../utils/workspace';
import type { Workspace } from '../utils/types';

export function useSearch(workspaces: Workspace[]) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(
    () => filterWorkspaces(workspaces, query),
    [workspaces, query],
  );

  return { query, setQuery, filtered };
}
