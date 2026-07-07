import { supabase } from './supabase';

// ── App shape <-> DB row mapping (camelCase <-> snake_case) ──────────────────
const empToRow = (orgId, e) => ({
  id:              e.id,
  org_id:          orgId,
  name:            e.name,
  roles:           e.roles || ['Other'],
  priority:        e.priority ?? 100,
  contract_type:   e.contractType || 'hourly',
  contract_period: e.contractPeriod || 'week',
  wage:            e.wage || 0,
  max_hours:       e.maxHours ?? 40,
  availability:    e.availability || {},
  pal_idx:         e.palIdx ?? 0,
});

const empFromRow = (r) => ({
  id:             r.id,
  name:           r.name,
  roles:          r.roles || ['Other'],
  priority:       r.priority ?? 100,
  contractType:   r.contract_type || 'hourly',
  contractPeriod: r.contract_period || 'week',
  wage:           Number(r.wage) || 0,
  maxHours:       r.max_hours ?? 40,
  availability:   r.availability || {},
  palIdx:         r.pal_idx ?? 0,
});

// ── Employees ────────────────────────────────────────────────────────────────
export async function fetchEmployees(orgId){
  const { data, error } = await supabase
    .from('employees').select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(empFromRow);
}

// Push the whole employee list for an org: upsert everything present, delete what's gone.
export async function syncEmployees(orgId, employees){
  const rows = employees.map(e => empToRow(orgId, e));
  if (rows.length){
    const { error } = await supabase.from('employees').upsert(rows, { onConflict: 'id' });
    if (error) throw error;
  }
  const ids = employees.map(e => e.id);
  let del = supabase.from('employees').delete().eq('org_id', orgId);
  if (ids.length) del = del.not('id', 'in', `(${ids.join(',')})`);
  const { error: e2 } = await del;
  if (e2) throw e2;
}

// ── Blocks (coverage blocks) ─────────────────────────────────────────────────
const blockToRow = (orgId, b, i) => ({
  id:         b.id,
  org_id:     orgId,
  name:       b.name,
  start_time: b.start,
  end_time:   b.end,
  roles:      b.roles || {},
  overrides:  b.overrides || {},
  sort_order: i,
});
const blockFromRow = (r) => {
  const ov = r.overrides && Object.keys(r.overrides).length ? r.overrides : undefined;
  return { id: r.id, name: r.name, start: r.start_time, end: r.end_time, roles: r.roles || {}, ...(ov ? { overrides: ov } : {}) };
};

export async function fetchBlocks(orgId){
  const { data, error } = await supabase
    .from('blocks').select('*').eq('org_id', orgId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data || []).map(blockFromRow);
}

export async function syncBlocks(orgId, blocks){
  const rows = blocks.map((b, i) => blockToRow(orgId, b, i));
  if (rows.length){
    const { error } = await supabase.from('blocks').upsert(rows, { onConflict: 'id' });
    if (error) throw error;
  }
  const ids = blocks.map(b => b.id);
  let del = supabase.from('blocks').delete().eq('org_id', orgId);
  if (ids.length) del = del.not('id', 'in', `(${ids.join(',')})`);
  const { error: e2 } = await del;
  if (e2) throw e2;
}

// ── Time off ─────────────────────────────────────────────────────────────────
const toToRow = (orgId, x) => ({
  id:          x.id,
  org_id:      orgId,
  employee_id: x.empId || null,
  type:        x.type || 'Holiday',
  start_date:  x.startDate,
  end_date:    x.endDate,
  status:      x.status || 'Pending',
  note:        x.note || null,
});
const toFromRow = (r) => ({
  id: r.id, empId: r.employee_id, type: r.type,
  startDate: r.start_date, endDate: r.end_date, status: r.status, note: r.note || '',
});

export async function fetchTimeOff(orgId){
  const { data, error } = await supabase
    .from('time_off').select('*').eq('org_id', orgId)
    .order('start_date', { ascending: true });
  if (error) throw error;
  return (data || []).map(toFromRow);
}

export async function syncTimeOff(orgId, timeOff){
  const rows = timeOff.map(x => toToRow(orgId, x));
  if (rows.length){
    const { error } = await supabase.from('time_off').upsert(rows, { onConflict: 'id' });
    if (error) throw error;
  }
  const ids = timeOff.map(x => x.id);
  let del = supabase.from('time_off').delete().eq('org_id', orgId);
  if (ids.length) del = del.not('id', 'in', `(${ids.join(',')})`);
  const { error: e2 } = await del;
  if (e2) throw e2;
}

// ── Schedules (keyed by week) ────────────────────────────────────────────────
export async function fetchSchedules(orgId){
  const { data, error } = await supabase
    .from('schedules').select('week_key, data').eq('org_id', orgId);
  if (error) throw error;
  const out = {};
  (data || []).forEach(r => { out[r.week_key] = r.data || {}; });
  return out;
}

export async function syncSchedules(orgId, schedules){
  const keys = Object.keys(schedules);
  const rows = keys.map(week_key => ({
    org_id: orgId,
    week_key,
    data: schedules[week_key],
    status: schedules[week_key]?.confirmed ? 'confirmed' : 'draft',
  }));
  if (rows.length){
    const { error } = await supabase.from('schedules').upsert(rows, { onConflict: 'org_id,week_key' });
    if (error) throw error;
  }
  let del = supabase.from('schedules').delete().eq('org_id', orgId);
  if (keys.length) del = del.not('week_key', 'in', `(${keys.map(k => `"${k}"`).join(',')})`);
  const { error: e2 } = await del;
  if (e2) throw e2;
}