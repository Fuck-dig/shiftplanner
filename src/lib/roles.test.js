import { describe, it, expect } from 'vitest';
import { mergeRoleOrder, reorderRoleList } from './roles';

describe('mergeRoleOrder', () => {
  it('keeps the saved order for roles that still exist', () => {
    expect(mergeRoleOrder(['Kitchen', 'Waiter', 'Manager'], ['Manager', 'Waiter', 'Kitchen']))
      .toEqual(['Kitchen', 'Waiter', 'Manager']);
  });

  it('drops roles from the saved order that no longer exist', () => {
    expect(mergeRoleOrder(['Kitchen', 'Waiter', 'DeletedRole'], ['Manager', 'Waiter', 'Kitchen']))
      .toEqual(['Kitchen', 'Waiter', 'Manager']);
  });

  it('appends newly-added roles (not yet in the saved order) at the end', () => {
    expect(mergeRoleOrder(['Waiter'], ['Waiter', 'Bartender', 'Manager']))
      .toEqual(['Waiter', 'Bartender', 'Manager']);
  });

  it('handles a completely empty saved order', () => {
    expect(mergeRoleOrder([], ['Manager', 'Waiter'])).toEqual(['Manager', 'Waiter']);
  });
});

describe('reorderRoleList', () => {
  const roles = ['Manager', 'Waiter', 'Kitchen', 'Bartender'];

  it('moves the dragged role to just before the target', () => {
    expect(reorderRoleList(roles, 'Bartender', 'Waiter')).toEqual(['Manager', 'Bartender', 'Waiter', 'Kitchen']);
  });

  it('moving a role forward past its target still lands it just before that target', () => {
    expect(reorderRoleList(roles, 'Manager', 'Bartender')).toEqual(['Waiter', 'Kitchen', 'Manager', 'Bartender']);
  });

  it('returns the exact same array reference (no-op) when dragged === target', () => {
    expect(reorderRoleList(roles, 'Waiter', 'Waiter')).toBe(roles);
  });

  it('returns the exact same array reference (no-op) when draggedRole is falsy', () => {
    expect(reorderRoleList(roles, null, 'Waiter')).toBe(roles);
    expect(reorderRoleList(roles, undefined, 'Waiter')).toBe(roles);
  });

  it('returns the exact same array reference (no-op) when the target role is unknown', () => {
    expect(reorderRoleList(roles, 'Bartender', 'NotARole')).toBe(roles);
  });

  it('a draggedRole not present in allRoles still gets spliced in before a valid target (no existence check on draggedRole itself — only target is validated)', () => {
    // Documenting actual behavior rather than an assumption: this path isn't
    // reachable from the real drag UI (you can only drag a role that's
    // already rendered in the list), but it's worth pinning down since
    // nothing in the source guards against it.
    expect(reorderRoleList(roles, 'Ghost', 'Waiter')).toEqual(['Manager', 'Ghost', 'Waiter', 'Kitchen', 'Bartender']);
  });
});
