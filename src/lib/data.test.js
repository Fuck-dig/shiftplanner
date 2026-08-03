import { describe, it, expect, vi, beforeEach } from 'vitest';

// A minimal fake of the bits of the Supabase client this module uses. Records
// every from()/select/upsert/delete chain so a test can assert on the query
// that WOULD have been sent, without a database.
//
// Worth being explicit about what this does and doesn't prove: it verifies the
// shape of what we send (column mapping, which rows get upserted, what the
// delete is filtered by) and how responses are handled. It does NOT verify that
// Postgres accepts it or that RLS behaves — those need a real database. The
// mapping and delete-filter logic is where a silent bug corrupts data, though,
// and that's exactly what's covered here.
const state = { ops: [], data: {}, errors: {} };

function makeBuilder(table) {
  const op = { table, type: null, rows: null, opts: null, cols: null, filters: [] };
  state.ops.push(op);
  const b = {
    select(cols) { op.type = op.type || 'select'; op.cols = cols; return b; },
    upsert(rows, opts) { op.type = 'upsert'; op.rows = rows; op.opts = opts; return b; },
    insert(rows) { op.type = 'insert'; op.rows = rows; return b; },
    update(row) { op.type = 'update'; op.rows = row; return b; },
    delete() { op.type = 'delete'; return b; },
    eq(col, val) { op.filters.push({ op: 'eq', col, val }); return b; },
    not(col, operator, val) { op.filters.push({ op: 'not', col, operator, val }); return b; },
    in(col, val) { op.filters.push({ op: 'in', col, val }); return b; },
    order() { return b; },
    single() { op.single = true; return b; },
    // Thenable, so `await supabase.from(...)...` resolves like the real client.
    then(resolve, reject) {
      const error = state.errors[table] || null;
      const data = error ? null : (state.data[table] ?? []);
      return Promise.resolve({ data, error }).then(resolve, reject);
    },
  };
  return b;
}

vi.mock('./supabase', () => ({
  supabase: { from: (table) => makeBuilder(table) },
  functionsUrl: 'https://example.test/functions/v1',
}));

const { fetchEmployees, syncEmployees } = await import('./data');

const opsFor = (table, type) => state.ops.filter(o => o.table === table && (!type || o.type === type));

beforeEach(() => { state.ops = []; state.data = {}; state.errors = {}; });

describe('fetchEmployees', () => {
  it('maps snake_case columns to the app\'s camelCase shape', async () => {
    state.data.employees = [{
      id: 'e1', name: 'Ann', email: 'ANN@x.test', phone: '123', roles: ['Waiter'],
      priority: 90, max_hours: 32, target_hours: 30, availability: { Mon: null },
      pal_idx: 3, email_notifications: false, pin: '1234',
    }];
    state.data.employee_wages = [];
    const [e] = await fetchEmployees('org1');
    expect(e).toMatchObject({
      id: 'e1', name: 'Ann', roles: ['Waiter'], priority: 90,
      maxHours: 32, targetHours: 30, palIdx: 3, emailNotifications: false, pin: '1234',
    });
  });

  it('merges wages in from the separate employee_wages table', async () => {
    state.data.employees = [{ id: 'e1', name: 'Ann', roles: ['Waiter'] }];
    state.data.employee_wages = [{ employee_id: 'e1', wage: '175.5', contract_type: 'monthly', contract_period: 'month' }];
    const [e] = await fetchEmployees('org1');
    // Wage arrives as a string from Postgres numeric — must come back a number,
    // or every cost calculation silently does string concatenation.
    expect(e.wage).toBe(175.5);
    expect(typeof e.wage).toBe('number');
    expect(e).toMatchObject({ contractType: 'monthly', contractPeriod: 'month' });
  });

  it('falls back to a zero wage when employee_wages is unreadable (a plain employee login)', async () => {
    // RLS gives a non-manager zero policies on employee_wages, so this errors
    // rather than returning rows. That must NOT break loading the roster.
    state.data.employees = [{ id: 'e1', name: 'Ann', roles: ['Waiter'] }];
    state.errors.employee_wages = { message: 'permission denied' };
    const [e] = await fetchEmployees('org1');
    expect(e).toMatchObject({ wage: 0, contractType: 'hourly', contractPeriod: 'week' });
    expect(e.name).toBe('Ann');
  });

  it('throws if the employees query itself fails, rather than returning a silently empty roster', async () => {
    // Important: an empty roster is indistinguishable from "everyone was
    // deleted", and syncEmployees would then happily delete everything.
    state.errors.employees = { message: 'network' };
    await expect(fetchEmployees('org1')).rejects.toBeTruthy();
  });

  it('scopes the query to the org', async () => {
    state.data.employees = []; state.data.employee_wages = [];
    await fetchEmployees('org-abc');
    const q = opsFor('employees', 'select')[0];
    expect(q.filters).toContainEqual({ op: 'eq', col: 'org_id', val: 'org-abc' });
  });
});

describe('syncEmployees', () => {
  const ann = { id: 'e1', name: 'Ann', roles: ['Waiter'], wage: 150, contractType: 'hourly', contractPeriod: 'week' };
  const bo  = { id: 'e2', name: 'Bo',  roles: ['Chef'],   wage: 200, contractType: 'monthly', contractPeriod: 'month' };

  it('upserts every employee passed in, mapped to DB columns', async () => {
    await syncEmployees('org1', [ann, bo]);
    const up = opsFor('employees', 'upsert')[0];
    expect(up.rows).toHaveLength(2);
    expect(up.rows[0]).toMatchObject({ id: 'e1', org_id: 'org1', name: 'Ann', roles: ['Waiter'], max_hours: 40 });
    expect(up.opts).toEqual({ onConflict: 'id' });
  });

  it('lowercases and trims email, and stores a blank one as null', async () => {
    await syncEmployees('org1', [{ ...ann, email: '  ANN@X.test ' }, { ...bo, email: '   ' }]);
    const rows = opsFor('employees', 'upsert')[0].rows;
    expect(rows[0].email).toBe('ann@x.test');
    expect(rows[1].email).toBeNull(); // '' would collide on a unique index; null won't
  });

  it('deletes only employees NOT in the list, scoped to the org', async () => {
    await syncEmployees('org1', [ann, bo]);
    const del = opsFor('employees', 'delete')[0];
    expect(del.filters).toContainEqual({ op: 'eq', col: 'org_id', val: 'org1' });
    expect(del.filters).toContainEqual({ op: 'not', col: 'id', operator: 'in', val: '(e1,e2)' });
  });

  it('DELETES EVERY EMPLOYEE IN THE ORG when handed an empty list', async () => {
    // Documenting a genuinely sharp edge rather than asserting it's desirable.
    // With no ids there's no `not in (...)` filter, so the delete is scoped to
    // org_id alone — i.e. the whole roster. That's correct when a manager
    // removes the last employee, and catastrophic if an empty array ever
    // reaches here by accident. Anything calling this must be sure the list is
    // real and not a not-yet-loaded empty default.
    await syncEmployees('org1', []);
    const del = opsFor('employees', 'delete')[0];
    expect(del.filters).toEqual([{ op: 'eq', col: 'org_id', val: 'org1' }]);
    expect(del.filters.some(f => f.op === 'not')).toBe(false);
  });

  it('writes wages to the separate employee_wages table, keyed by employee', async () => {
    await syncEmployees('org1', [ann, bo]);
    const up = opsFor('employee_wages', 'upsert')[0];
    expect(up.rows).toEqual([
      { employee_id: 'e1', org_id: 'org1', wage: 150, contract_type: 'hourly',  contract_period: 'week' },
      { employee_id: 'e2', org_id: 'org1', wage: 200, contract_type: 'monthly', contract_period: 'month' },
    ]);
    expect(up.opts).toEqual({ onConflict: 'employee_id' });
  });

  it('defaults a missing wage to 0/hourly/week rather than writing undefined', async () => {
    await syncEmployees('org1', [{ id: 'e3', name: 'Cy', roles: ['Waiter'] }]);
    expect(opsFor('employee_wages', 'upsert')[0].rows[0])
      .toEqual({ employee_id: 'e3', org_id: 'org1', wage: 0, contract_type: 'hourly', contract_period: 'week' });
  });

  it('cleans up wage rows for removed employees too, so they don\'t outlive the person', async () => {
    await syncEmployees('org1', [ann]);
    const del = opsFor('employee_wages', 'delete')[0];
    expect(del.filters).toContainEqual({ op: 'eq', col: 'org_id', val: 'org1' });
    expect(del.filters).toContainEqual({ op: 'not', col: 'employee_id', operator: 'in', val: '(e1)' });
  });

  it('does NOT run the delete when the upsert failed', async () => {
    // The invariant that matters isn't "it throws" — it's that a failed save
    // never falls through to the delete, which would remove the very rows it
    // just failed to write. Asserting only on the throw passes even when the
    // delete does run (it throws later, from the delete's own error), so this
    // asserts on the absence of the delete instead.
    state.errors.employees = { message: 'constraint violation' };
    await expect(syncEmployees('org1', [ann])).rejects.toBeTruthy();
    expect(opsFor('employees', 'delete')).toHaveLength(0);
  });
});
