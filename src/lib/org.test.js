import { describe, it, expect, vi, beforeEach } from 'vitest';

// Same mock shape as data.test.js, plus auth.getUser — org membership is the
// "who can see what and as what role" layer, so the thing worth pinning down is
// that a user only ever gets their OWN membership rows and their OWN role.
const state = { ops: [], data: {}, errors: {}, user: { id: 'user-1' } };

function makeBuilder(table) {
  const op = { table, type: null, cols: null, filters: [] };
  state.ops.push(op);
  const b = {
    select(cols) { op.type = 'select'; op.cols = cols; return b; },
    eq(col, val) { op.filters.push({ op: 'eq', col, val }); return b; },
    in(col, val) { op.filters.push({ op: 'in', col, val }); return b; },
    order() { return b; },
    then(resolve, reject) {
      const error = state.errors[table] || null;
      const data = error ? null : (state.data[table] ?? []);
      return Promise.resolve({ data, error }).then(resolve, reject);
    },
  };
  return b;
}

vi.mock('./supabase', () => ({
  supabase: {
    from: (table) => makeBuilder(table),
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    rpc: async (fn, args) => { state.ops.push({ rpc: fn, args }); return { data: state.rpcData ?? null, error: state.rpcError ?? null }; },
  },
  functionsUrl: 'https://example.test/functions/v1',
}));

const { listOrgs, acceptPendingInvitations } = await import('./org');

beforeEach(() => { state.ops = []; state.data = {}; state.errors = {}; state.user = { id: 'user-1' }; });

describe('listOrgs', () => {
  it('filters memberships to the signed-in user', async () => {
    // This filter is load-bearing for privilege, not just tidiness. RLS on
    // `memberships` deliberately lets you see other members' rows (TeamAccess
    // needs that), so without an explicit user_id filter this returns one row
    // per member of every shared org — and a colleague's row could supply
    // THEIR role instead of yours.
    state.data.memberships = [{ org_id: 'o1', role: 'employee', created_at: '2026-01-01' }];
    state.data.organizations = [{ id: 'o1', name: 'Almus' }];
    await listOrgs();
    const q = state.ops.find(o => o.table === 'memberships');
    expect(q.filters).toContainEqual({ op: 'eq', col: 'user_id', val: 'user-1' });
  });

  it('returns one entry per org, carrying that user\'s own role', async () => {
    state.data.memberships = [
      { org_id: 'o1', role: 'owner',    created_at: '2026-01-01' },
      { org_id: 'o2', role: 'employee', created_at: '2026-02-01' },
    ];
    state.data.organizations = [{ id: 'o1', name: 'Almus' }, { id: 'o2', name: 'Other' }];
    expect(await listOrgs()).toEqual([
      { id: 'o1', name: 'Almus', role: 'owner' },
      { id: 'o2', name: 'Other', role: 'employee' },
    ]);
  });

  it('returns [] when nobody is signed in, without querying anything', async () => {
    state.user = null;
    expect(await listOrgs()).toEqual([]);
    expect(state.ops).toHaveLength(0);
  });

  it('returns [] for a user with no memberships, without a second query', async () => {
    state.data.memberships = [];
    expect(await listOrgs()).toEqual([]);
    expect(state.ops.filter(o => o.table === 'organizations')).toHaveLength(0);
  });

  it('drops memberships whose organization row is missing rather than emitting a nameless org', async () => {
    // An org row unreadable or deleted out from under a membership shouldn't
    // produce an entry with an undefined name that renders as blank.
    state.data.memberships = [
      { org_id: 'o1', role: 'owner', created_at: '2026-01-01' },
      { org_id: 'gone', role: 'owner', created_at: '2026-01-02' },
    ];
    state.data.organizations = [{ id: 'o1', name: 'Almus' }];
    expect(await listOrgs()).toEqual([{ id: 'o1', name: 'Almus', role: 'owner' }]);
  });

  it('throws rather than returning [] when the membership query fails', async () => {
    // Returning [] would look identical to "you belong to no restaurants" and
    // drop the user on the empty picker instead of showing an error.
    state.errors.memberships = { message: 'network' };
    await expect(listOrgs()).rejects.toBeTruthy();
  });
});

describe('acceptPendingInvitations — privilege escalation guard', () => {
  beforeEach(() => { state.ops = []; state.rpcData = undefined; state.rpcError = undefined; });

  it('delegates to the database function instead of writing from the client', async () => {
    // The old version read invitations, inserted a membership with a role the
    // CLIENT supplied, then marked the invite used. That required RLS to let
    // the browser write to both tables — and it did, so broadly that any
    // logged-in user could rewrite any invitation row and make themselves an
    // owner of someone else's restaurant.
    state.rpcData = 2;
    await expect(acceptPendingInvitations()).resolves.toBe(2);
    expect(state.ops).toContainEqual(expect.objectContaining({ rpc: 'accept_my_invitations' }));
  });

  it('never touches the invitations or memberships tables directly', async () => {
    // If this fails, a client-side write path has been reintroduced and the
    // role is choosable by the caller again. That IS the vulnerability.
    state.rpcData = 1;
    await acceptPendingInvitations();
    const tables = state.ops.map((o) => o.table).filter(Boolean);
    expect(tables).not.toContain('invitations');
    expect(tables).not.toContain('memberships');
  });

  it('sends no role — the database reads it off the invitation row', async () => {
    state.rpcData = 1;
    await acceptPendingInvitations();
    const call = state.ops.find((o) => o.rpc === 'accept_my_invitations');
    expect(JSON.stringify(call.args ?? {})).not.toMatch(/owner|manager|role/i);
  });

  it('surfaces a failure rather than quietly reporting success', async () => {
    state.rpcError = new Error('permission denied');
    await expect(acceptPendingInvitations()).rejects.toThrow('permission denied');
  });
});
