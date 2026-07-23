import { supabase, functionsUrl } from './supabase';

// ── App shape <-> DB row mapping (camelCase <-> snake_case) ──────────────────
const empToRow = (orgId, e) => ({
  id:              e.id,
  org_id:          orgId,
  name:            e.name,
  email:           (e.email||'').trim().toLowerCase() || null,
  phone:           (e.phone||'').trim() || null,
  roles:           e.roles || ['Other'],
  priority:        e.priority ?? 100,
  contract_type:   e.contractType || 'hourly',
  contract_period: e.contractPeriod || 'week',
  wage:            e.wage || 0,
  max_hours:       e.maxHours ?? 40,
  target_hours:    e.targetHours ?? null,
  availability:    e.availability || {},
  pal_idx:         e.palIdx ?? 0,
  email_notifications: e.emailNotifications !== false,
});

const empFromRow = (r) => ({
  id:             r.id,
  name:           r.name,
  email:          r.email || '',
  phone:          r.phone || '',
  roles:          r.roles || ['Other'],
  priority:       r.priority ?? 100,
  contractType:   r.contract_type || 'hourly',
  contractPeriod: r.contract_period || 'week',
  wage:           Number(r.wage) || 0,
  maxHours:       r.max_hours ?? 40,
  targetHours:    r.target_hours ?? null,
  availability:   r.availability || {},
  palIdx:         r.pal_idx ?? 0,
  emailNotifications: r.email_notifications ?? true,
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

// Employee-initiated time-off/vacation request — incremental single-row
// insert, unlike syncTimeOff below (which diffs/deletes the whole array and
// is the manager Dashboard's territory). An employee session only ever
// holds a read snapshot of the org's time_off, not something safe to
// resync wholesale on submit. Always created as 'Pending' — a manager
// approves/rejects it from their existing Time Off view.
export async function createTimeOffRequest(orgId, { empId, type, startDate, endDate, note }){
  const row = toToRow(orgId, { empId, type, startDate, endDate, status: 'Pending', note });
  delete row.id; // let the DB default assign it
  const { data, error } = await supabase.from('time_off').insert(row).select().single();
  if (error) throw error;
  return toFromRow(data);
}

// Withdraw a request that's still awaiting a decision — same incremental,
// single-row shape as createTimeOffRequest above. The employee-side caller
// only offers this while status is still 'Pending' (once a manager has
// approved/rejected it, that decision should stick).
export async function deleteTimeOffRequest(id){
  const { error } = await supabase.from('time_off').delete().eq('id', id);
  if (error) throw error;
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

// Best-effort email companion to an in-app notification, via the
// send-notification Edge Function (Resend under the hood — same account as
// the existing invite emails). Deliberately never throws: the in-app
// notification row is the source of truth and always gets created
// regardless of whether this succeeds, so a missing RESEND_API_KEY, an
// undeployed function, or a flaky network shouldn't block the action that
// triggered it (approving time off, publishing a schedule, etc.) — it just
// means that one email quietly doesn't arrive, which the person can still
// see once they open the app.
// ── Direct messages ──────────────────────────────────────────────────────────
// Manager-authored, free-text messages to one employee, a whole role, or
// everyone — distinct from `notifications`, which are always system-generated
// from a translated messageKey/messageVars template. One row per recipient,
// same fan-out-at-insert pattern as createNotification.
const msgFromRow = (r) => ({
  id: r.id, recipientEmpId: r.recipient_emp_id, senderLabel: r.sender_label,
  subject: r.subject || '', body: r.body, allowReplies: !!r.allow_replies,
  read: !!r.read, managerUnread: !!r.manager_unread, createdAt: r.created_at,
});

export async function fetchMessages(empId){
  const { data, error } = await supabase
    .from('messages').select('*').eq('recipient_emp_id', empId)
    .order('created_at', { ascending: false }).limit(50);
  if (error) throw error;
  return (data || []).map(msgFromRow);
}

// Manager-side: sent messages that have a new reply the manager hasn't seen
// yet — feeds the same pendingItems "needs your attention" mechanism the
// swap/time-off approval queue already uses, which works even for a manager
// with no employees row of their own (see NotificationBell.jsx's notes).
export async function fetchUnseenMessageReplies(orgId){
  const { data, error } = await supabase
    .from('messages').select('*').eq('org_id', orgId).eq('manager_unread', true)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(msgFromRow);
}

export async function sendMessage(orgId, recipientEmpIds, { senderLabel, subject, body, allowReplies }){
  const rows = recipientEmpIds.map(recipient_emp_id => ({
    org_id: orgId, recipient_emp_id, sender_label: senderLabel,
    subject: subject || null, body, allow_replies: !!allowReplies,
  }));
  if (!rows.length) return;
  const { error } = await supabase.from('messages').insert(rows);
  if (error) throw error;
}

export async function markMessageRead(id){
  const { error } = await supabase.from('messages').update({ read: true }).eq('id', id);
  if (error) throw error;
}

export async function markMessageSeenByManager(id){
  const { error } = await supabase.from('messages').update({ manager_unread: false }).eq('id', id);
  if (error) throw error;
}

export const replyFromRow = (r) => ({
  id: r.id, messageId: r.message_id, fromEmployee: !!r.from_employee,
  authorLabel: r.author_label, body: r.body, createdAt: r.created_at,
});

export async function fetchMessageReplies(messageId){
  const { data, error } = await supabase
    .from('message_replies').select('*').eq('message_id', messageId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(replyFromRow);
}

// Posts a reply and flips whichever "needs attention" flag belongs to the
// other side: an employee's reply sets manager_unread=true (surfaces in the
// manager's pendingItems), a manager's reply sets read=false (resurfaces the
// thread as unread in the employee's own bell).
// Returns the inserted row (real id + created_at) rather than nothing, so
// the caller can use it for its own optimistic UI update instead of making
// one up client-side — otherwise a locally-generated id never matches the
// real row's id when the realtime subscription in MessageThreadModal
// delivers the same INSERT a moment later, and the reply renders twice.
export async function sendMessageReply(messageId, { fromEmployee, authorLabel, body }){
  const { data, error: insErr } = await supabase.from('message_replies').insert({
    message_id: messageId, from_employee: fromEmployee, author_label: authorLabel, body,
  }).select().single();
  if (insErr) throw insErr;
  const patch = fromEmployee ? { manager_unread: true } : { read: false };
  const { error: updErr } = await supabase.from('messages').update(patch).eq('id', messageId);
  if (updErr) throw updErr;
  return replyFromRow(data);
}

export async function sendNotificationEmail({ to, subject, body, ctaLabel, ctaUrl }){
  if (!to) return;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(functionsUrl('send-notification'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ to, subject, body, ctaLabel, ctaUrl }),
    });
    const json = await res.json().catch(() => ({}));
    if (json.error) throw new Error(json.error);
  } catch (err) {
    console.error('Email notification failed (non-blocking):', err);
  }
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
export async function updateEmployeeSelfProfile(empId, { name, palIdx, phone, availability, emailNotifications } = {}){
  const row = {};
  if (name != null)   row.name = name;
  if (palIdx != null)  row.pal_idx = palIdx;
  if (phone != null)  row.phone = phone;
  if (availability != null) row.availability = availability;
  if (emailNotifications != null) row.email_notifications = emailNotifications;
  if (Object.keys(row).length === 0) return;
  const { error } = await supabase.from('employees').update(row).eq('id', empId);
  if (error) throw error;
}

// Role display/group order used to live here as a Supabase-synced,
// org-wide setting — reverted in favor of each person (manager or employee)
// keeping their own local order (see 'sa2_roleOrder_'+orgId in App.jsx and
// EmployeeView.jsx), since that's what was actually wanted: everyone gets
// to arrange their own Team view, not one shared order for the whole org.

// ── Role colours ─────────────────────────────────────────────────────────────
// Unlike order, colour IS shared org-wide — it's how a role visually reads
// as "the same role" everywhere, not a personal layout preference. Written
// by the manager only (Coverage); read-only everywhere else.
export async function fetchRoleStyles(orgId){
  const { data, error } = await supabase.from('organizations').select('role_styles').eq('id', orgId).single();
  if (error) throw error;
  return (data?.role_styles && typeof data.role_styles === 'object') ? data.role_styles : {};
}

export async function saveRoleStyles(orgId, styles){
  const { error } = await supabase.from('organizations').update({ role_styles: styles }).eq('id', orgId);
  if (error) throw error;
}

// ── Daily revenue (Costs tab: revenue vs labor cost) ─────────────────────────
// One row per org per calendar day, entered by hand from Costs — there's no
// POS integration, this is just what the manager typed in. Loaded in bulk
// (like schedules/time off) and kept as a plain {isoDate: amount} map in
// App.jsx, rather than re-fetching per week, since the whole point is being
// able to look back across weeks/months without extra round-trips.
export async function fetchDailyRevenue(orgId){
  const { data, error } = await supabase.from('daily_revenue').select('date, amount').eq('org_id', orgId);
  if (error) throw error;
  return Object.fromEntries((data || []).map(r => [r.date, Number(r.amount) || 0]));
}

// `source` defaults to 'manual' since that's the only writer today (the
// Costs tab input). A future POS integration would call this same function
// with source:'pos:<provider>' instead of duplicating the upsert logic —
// see the migration's comment for why the column exists ahead of any actual
// integration.
export async function saveDailyRevenue(orgId, date, amount, source='manual'){
  const { error } = await supabase.from('daily_revenue').upsert(
    { org_id: orgId, date, amount: amount || 0, source, updated_at: new Date().toISOString() },
    { onConflict: 'org_id,date' }
  );
  if (error) throw error;
}