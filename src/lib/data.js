import { supabase } from './supabase';

// ── App shape <-> DB row mapping (camelCase <-> snake_case) ──────────────────
const empToRow = (orgId, e) => ({
  id:              e.id,
  org_id:          orgId,
  name:            e.name,
  email:           (e.email||'').trim().toLowerCase() || null,
  roles:           e.roles || ['Other'],
  priority:        e.priority ?? 100,
  contract_type:   e.contractType || 'hourly',
  contract_period: e.contractPeriod || 'week',
  wage:            e.wage || 0,
  max_hours:       e.maxHours ?? 40,
  target_hours:    e.targetHours ?? null,
  availability:    e.availability || {},
  pal_idx:         e.palIdx ?? 0,
  color_set:       e.colorSet ?? false,
});

const empFromRow = (r) => ({
  id:             r.id,
  name:           r.name,
  email:          r.email || '',
  roles:          r.roles || ['Other'],
  priority:       r.priority ?? 100,
  contractType:   r.contract_type || 'hourly',
  contractPeriod: r.contract_period || 'week',
  wage:           Number(r.wage) || 0,
  maxHours:       r.max_hours ?? 40,
  targetHours:    r.target_hours ?? null,
  availability:   r.availability || {},
  palIdx:         r.pal_idx ?? 0,
  colorSet:       r.color_set ?? false,
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

// ── Shift swaps ──────────────────────────────────────────────────────────────
// Unlike employees/blocks/time_off/schedules above, these three tables are
// written incrementally (insert/update single rows) rather than "sync the
// whole array" — both the manager's Dashboard and an employee's own
// EmployeeView session write to them independently, so neither side ever
// holds the full authoritative list to diff against.
const swapToRow = (orgId, x) => ({
  id:                x.id,
  org_id:            orgId,
  week_key:          x.weekKey,
  day:               x.day,
  block_id:          x.blockId,
  role:              x.role,
  from_emp_id:       x.fromEmpId,
  to_emp_id:         x.toEmpId || null,
  claimed_by_emp_id: x.claimedByEmpId || null,
  status:            x.status || 'open',
  note:              x.note || null,
});
const swapFromRow = (r) => ({
  id: r.id, weekKey: r.week_key, day: r.day, blockId: r.block_id, role: r.role,
  fromEmpId: r.from_emp_id, toEmpId: r.to_emp_id, claimedByEmpId: r.claimed_by_emp_id,
  status: r.status, note: r.note || '', createdAt: r.created_at, updatedAt: r.updated_at,
});

export async function fetchShiftSwaps(orgId){
  const { data, error } = await supabase
    .from('shift_swaps').select('*').eq('org_id', orgId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(swapFromRow);
}

// Create a new swap offer (release-to-anyone if toEmpId is omitted, or a
// direct request to a specific coworker). Returns the created row.
export async function createShiftSwap(orgId, swap){
  const row = swapToRow(orgId, swap);
  delete row.id; // let the DB default (gen_random_uuid()) assign it
  const { data, error } = await supabase.from('shift_swaps').insert(row).select().single();
  if (error) throw error;
  return swapFromRow(data);
}

// Generic status/claim update — covers claim (open -> claimed), direct-request
// accept/decline, and manager approve/decline, all of which are just a status
// (and sometimes claimed_by_emp_id) change on an existing row.
export async function updateShiftSwap(id, patch){
  const row = {};
  if ('status' in patch)         row.status = patch.status;
  if ('claimedByEmpId' in patch) row.claimed_by_emp_id = patch.claimedByEmpId;
  row.updated_at = new Date().toISOString();
  const { data, error } = await supabase.from('shift_swaps').update(row).eq('id', id).select().single();
  if (error) throw error;
  return swapFromRow(data);
}

export async function deleteShiftSwap(id){
  const { error } = await supabase.from('shift_swaps').delete().eq('id', id);
  if (error) throw error;
}

// ── Notifications ────────────────────────────────────────────────────────────
const notifFromRow = (r) => ({
  id: r.id, empId: r.emp_id, type: r.type,
  messageKey: r.message_key, messageVars: r.message_vars || {},
  link: r.link || null, read: !!r.read, createdAt: r.created_at,
});

// One employee's own notifications (manager and employee sessions alike only
// ever need "notifications addressed to me").
export async function fetchNotifications(empId){
  const { data, error } = await supabase
    .from('notifications').select('*').eq('emp_id', empId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data || []).map(notifFromRow);
}

// Create one notification for one employee. Fan-out (e.g. "schedule
// published" for every employee with a shift that week) is the caller's job —
// call this once per recipient rather than modeling a broadcast row, since a
// single shared "read" boolean can't represent multiple independent readers.
export async function createNotification(orgId, empId, { type, messageKey, messageVars = {}, link = null }){
  const { error } = await supabase.from('notifications').insert({
    org_id: orgId, emp_id: empId, type, message_key: messageKey, message_vars: messageVars, link,
  });
  if (error) throw error;
}

export async function markNotificationRead(id){
  const { error } = await supabase.from('notifications').update({ read: true }).eq('id', id);
  if (error) throw error;
}

export async function markAllNotificationsRead(empId){
  const { error } = await supabase.from('notifications').update({ read: true }).eq('emp_id', empId).eq('read', false);
  if (error) throw error;
}

// ── Schedule templates ───────────────────────────────────────────────────────
const templateFromRow = (r) => ({ id: r.id, name: r.name, blocks: r.blocks || [], createdAt: r.created_at });

export async function fetchTemplates(orgId){
  const { data, error } = await supabase
    .from('schedule_templates').select('*').eq('org_id', orgId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(templateFromRow);
}

export async function saveTemplate(orgId, name, blocks){
  const { data, error } = await supabase
    .from('schedule_templates').insert({ org_id: orgId, name, blocks }).select().single();
  if (error) throw error;
  return templateFromRow(data);
}

export async function deleteTemplate(id){
  const { error } = await supabase.from('schedule_templates').delete().eq('id', id);
  if (error) throw error;
}

// ── Self-service profile edits ───────────────────────────────────────────────
// Incremental single-row update, unlike syncEmployees() above — EmployeeView
// only ever holds a read snapshot of the whole org's roster, not something
// it's safe to resync wholesale on every keystroke from an employee's own
// session (that's Dashboard/manager territory).
// Avatar colour is a one-time pick — setting palIdx here always also locks
// color_set=true, so the picker won't be offered again after this call.
// (App-level enforcement only, same trust model as the rest of this file.)
export async function updateEmployeeSelfProfile(empId, { name, palIdx } = {}){
  const row = {};
  if (name != null)   row.name = name;
  if (palIdx != null){ row.pal_idx = palIdx; row.color_set = true; }
  if (Object.keys(row).length === 0) return;
  const { error } = await supabase.from('employees').update(row).eq('id', empId);
  if (error) throw error;
}