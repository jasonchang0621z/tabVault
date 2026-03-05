import { describe, it, expect } from 'vitest';
import { filterWorkspaces, sortWorkspaces } from '../../utils/workspace';
import type { Workspace } from '../../utils/types';

function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: crypto.randomUUID(),
    name: 'Test Workspace',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tabs: [],
    tabGroups: [],
    tabCount: 0,
    ...overrides,
  };
}

describe('filterWorkspaces', () => {
  const workspaces: Workspace[] = [
    makeWorkspace({
      name: 'Work - Frontend',
      tabs: [
        { url: 'https://github.com/my-project', title: 'GitHub - My Project', favIconUrl: '', pinned: false, index: 0, groupId: null },
        { url: 'https://stackoverflow.com/questions/123', title: 'How to use React hooks', favIconUrl: '', pinned: false, index: 1, groupId: null },
      ],
      tabCount: 2,
    }),
    makeWorkspace({
      name: 'Research - AI',
      tabs: [
        { url: 'https://arxiv.org/abs/2401.001', title: 'Attention Is All You Need', favIconUrl: '', pinned: false, index: 0, groupId: null },
      ],
      tabCount: 1,
    }),
    makeWorkspace({
      name: 'Shopping',
      tabs: [
        { url: 'https://amazon.com/dp/B123', title: 'USB-C Hub', favIconUrl: '', pinned: false, index: 0, groupId: null },
      ],
      tabCount: 1,
    }),
  ];

  it('returns all workspaces for empty query', () => {
    expect(filterWorkspaces(workspaces, '')).toEqual(workspaces);
    expect(filterWorkspaces(workspaces, '   ')).toEqual(workspaces);
  });

  it('filters by workspace name', () => {
    const result = filterWorkspaces(workspaces, 'frontend');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Work - Frontend');
  });

  it('filters by tab title', () => {
    const result = filterWorkspaces(workspaces, 'react hooks');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Work - Frontend');
  });

  it('filters by tab URL', () => {
    const result = filterWorkspaces(workspaces, 'arxiv.org');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Research - AI');
  });

  it('is case insensitive', () => {
    expect(filterWorkspaces(workspaces, 'SHOPPING')).toHaveLength(1);
    expect(filterWorkspaces(workspaces, 'GitHub')).toHaveLength(1);
  });

  it('returns empty array when no match', () => {
    expect(filterWorkspaces(workspaces, 'nonexistent')).toHaveLength(0);
  });
});

describe('sortWorkspaces', () => {
  const workspaces: Workspace[] = [
    makeWorkspace({ name: 'Beta', createdAt: '2026-02-01T00:00:00.000Z' }),
    makeWorkspace({ name: 'Alpha', createdAt: '2026-03-01T00:00:00.000Z' }),
    makeWorkspace({ name: 'Charlie', createdAt: '2026-01-01T00:00:00.000Z' }),
  ];

  it('sorts newest first', () => {
    const result = sortWorkspaces(workspaces, 'newest');
    expect(result.map((w) => w.name)).toEqual(['Alpha', 'Beta', 'Charlie']);
  });

  it('sorts oldest first', () => {
    const result = sortWorkspaces(workspaces, 'oldest');
    expect(result.map((w) => w.name)).toEqual(['Charlie', 'Beta', 'Alpha']);
  });

  it('sorts alphabetically', () => {
    const result = sortWorkspaces(workspaces, 'alphabetical');
    expect(result.map((w) => w.name)).toEqual(['Alpha', 'Beta', 'Charlie']);
  });

  it('does not mutate the original array', () => {
    const original = [...workspaces];
    sortWorkspaces(workspaces, 'alphabetical');
    expect(workspaces).toEqual(original);
  });
});
