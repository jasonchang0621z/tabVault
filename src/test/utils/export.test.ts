import { describe, it, expect } from 'vitest';
import { validateWorkspaces, mergeWorkspaces } from '../../utils/export';
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

describe('validateWorkspaces', () => {
  it('accepts valid workspace array', () => {
    const workspaces = [makeWorkspace(), makeWorkspace()];
    expect(validateWorkspaces(workspaces)).toEqual(workspaces);
  });

  it('throws on non-array input', () => {
    expect(() => validateWorkspaces('not an array')).toThrow('expected an array');
    expect(() => validateWorkspaces({})).toThrow('expected an array');
  });

  it('throws on invalid workspace object', () => {
    expect(() => validateWorkspaces([{ id: 'x' }])).toThrow('Invalid workspace at index 0');
  });

  it('throws when missing required fields', () => {
    const invalid = { id: '1', name: 'test', createdAt: '2026-01-01', updatedAt: '2026-01-01', tabs: [] };
    expect(() => validateWorkspaces([invalid])).toThrow('Invalid workspace at index 0');
  });
});

describe('mergeWorkspaces', () => {
  it('adds non-duplicate workspaces', () => {
    const existing = [makeWorkspace({ id: 'a', name: 'A' })];
    const imported = [makeWorkspace({ id: 'b', name: 'B' })];
    const result = mergeWorkspaces(existing, imported);
    expect(result).toHaveLength(2);
    expect(result[1].name).toBe('B');
  });

  it('skips workspaces with duplicate ids', () => {
    const existing = [makeWorkspace({ id: 'a', name: 'A' })];
    const imported = [makeWorkspace({ id: 'a', name: 'A updated' })];
    const result = mergeWorkspaces(existing, imported);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('A');
  });

  it('handles empty arrays', () => {
    expect(mergeWorkspaces([], [])).toEqual([]);
    const ws = [makeWorkspace()];
    expect(mergeWorkspaces(ws, [])).toEqual(ws);
    expect(mergeWorkspaces([], ws)).toEqual(ws);
  });
});
