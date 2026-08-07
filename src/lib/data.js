import { supabase, functionsUrl } from './supabase';

// ── App shape <-> DB row mapping (camelCase <-> snake_case) ──────────────────
// wage/contractType/contractPeriod are NOT here — they live on the separate
// employee_wages table (see below and 20260728140000_employee_wages.sql),
// since that table's RLS is the only way to actually keep them hidden from
// a plain employee login. fetchEmployees/syncEmployees still read and write
// them as part of the same employee object as before, so nothing else in
// the app (schedule.js's cost ranking, EmployeesView, Costs, the shift
// picker's rate tag) had to change — only where these two functions get the
// data from.
const empToRow = (orgId, e) => ({
  id:              e.id,
  org_id:          orgId,
  name:            e.name,
  email:           (e.email||'').trim().toLowerCase() || null,
  phone:           (e.phone||'').trim() || null,
  roles:           e.roles || ['Other'],
  priority:        e.priority ?? 100,
  max_hours:       e.maxHours ?? 40,
  target_hours:    e.targetHours ?? null,
  availability:    e.availability || {},
  pal_idx:         e.palIdx ?? 0,
  email_notifications: e.emailNotifications !== false,
  archived:        e.archived === true,
  pin:             (e.pin||'').trim() || null,
  push_prefs:      e.pushPrefs || { enabled:false, shiftChanges:true, shiftReminder:true, timeOffSwap:true, messages:true },
});

const empFromRow = (r) => ({
  id:             r.id,
  name:           r.name,
  email:          r.email || '',
  phone:          r.phone || '',
  roles:          r.roles || ['Other'],
  priority:       r.priority ?? 100,
  maxHours:       r.max_hours ?? 40,
  targetHours:    r.target_hours ?? null,
  availability:   r.availability || {},
  palIdx:         r.pal_idx ?? 0,
  emailNotifications: r.email_notifications ?? true,
  archived:       r.archived === true,
  pin:            r.pin || '',
  pushPrefs:      r.push_prefs || { enabled:false, shiftChanges:true, shiftReminder:true, timeOffSwap:true, messages:true },
});

// sickPayPct is deliberately NULLABLE all the way through: null means
// "inherit the org default", 0 means "this person gets nothing". Coercing it
// to a number here with `|| 0` would erase that distinction at the door and
// make effectiveSickPct's override logic unreachable.
const DEFAULT_WAGE = { wage:0, contractType:'hourly', contractPeriod:'week', sickPayPct:null };
const wageFromRow = (r) => ({ wage:Number(r.wage)||0, contractType:r.contract_type||'hourly', contractPeriod:r.contract_period||'week', sickPayPct:r.sick_pay_pct==null?null:Number(r.sick_pay_pct) });

// A plain employee's RLS has zero policies on employee_wages (by design —
// see the migration), so this comes back empty for them rather than
// erroring: fetchEmployees below just falls back to DEFAULT_WAGE per
// employee in that case, which is invisible anyway since no employee-facing
// screen (EmployeeView, KioskView) ever reads wage/contractType/
// contractPeriod off an employee object.
async function fetchEmployeeWages(orgId){
  const { data, error } = await supabase
    .from('employee_wages').select('employee_id, wage, contract_type, contract_period, sick_pay_pct')
    .eq('org_id', orgId);
  if (error) { console.error('fetchEmployeeWages failed (expected for a non-manager login):', error); return {}; }
  return Object.fromEntries((data||[]).map(r => [r.employee_id, wageFromRow(r)]));
}

// ── Employees ────────────────────────────────────────────────────────────────
export async function fetchEmployees(orgId){
  const [{ data, error }, wages] = await Promise.all([
    supabase.from('employees').select('*').eq('org_id', orgId).order('created_at', { ascending: true }),
    fetchEmployeeWages(orgId),
  ]);
  if (error) throw error;
  return (data || []).map(r => ({ ...empFromRow(r), ...(wages[r.id] || DEFAULT_WAGE) }));
}

// Push the whole employee list for an org: upsert everything present, delete what's gone.
// Only ever called from a manager/owner session (a plain employee never
// reaches the Employees admin screen that calls this), so writing wage data
// here is safe — RLS would reject it from an employee session anyway.
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

  const wageRows = employees.map(e => ({ employee_id:e.id, org_id:orgId, wage:e.wage||0, contract_type:e.contractType||'hourly', contract_period:e.contractPeriod||'week',
    // '' (a cleared input) and undefined both mean inherit, and must land as
    // SQL null rather than 0 — 0 is a different, deliberate answer.
    sick_pay_pct:(e.sickPayPct===''||e.sickPayPct==null)?null:Number(e.sickPayPct) }));
  if (wageRows.length){
    const { error: e3 } = await supabase.from('employee_wages').upsert(wageRows, { onConflict: 'employee_id' });
    if (e3) throw e3;
  }
  let delWages = supabase.from('employee_wages').delete().eq('org_id', orgId);
  if (ids.length) delWages = delWages.not('employee_id', 'in', `(${ids.join(',')})`);
  const { error: e4 } = await delWages;
  if (e4) throw e4;
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

// Push the schedule map. `baseline` is the last state we know the server had
// (from the initial load or the most recent poll); pass it and this only
// touches what actually changed.
//
// Without a baseline this writes EVERY week it holds and deletes every week it
// doesn't — which is genuinely destructive with more than one manager:
//
//   - Two managers editing DIFFERENT weeks still clobber each other, because
//     each pushes its whole map including its stale copy of the other's week.
//   - Worse, if manager A creates a new week and manager B saves anything
//     before B's 45s poll picks it up, B's delete removes A's week entirely —
//     B never knew it existed.
//
// Diffing against the baseline fixes both: only changed weeks are written, and
// only weeks we previously SAW and that are now gone get deleted. Concurrent
// edits to the same week still resolve last-write-wins (see TASKS.md), but
// that's a far smaller window than "any save clobbers everything".
export async function syncSchedules(orgId, schedules, baseline){
  const keys = Object.keys(schedules);
  const changedKeys = baseline
    ? keys.filter(k => JSON.stringify(schedules[k]) !== JSON.stringify(baseline[k]))
    : keys;
  const rows = changedKeys.map(week_key => ({
    org_id: orgId,
    week_key,
    data: schedules[week_key],
    status: schedules[week_key]?.confirmed ? 'confirmed' : 'draft',
  }));
  if (rows.length){
    const { error } = await supabase.from('schedules').upsert(rows, { onConflict: 'org_id,week_key' });
    if (error) throw error;
  }
  // Only delete weeks we actually knew about and that have since been removed
  // locally. With no baseline, fall back to the old behaviour of deleting
  // anything not present — correct for a single session, dangerous with two.
  const removedKeys = baseline
    ? Object.keys(baseline).filter(k => !(k in schedules))
    : null;
  if (removedKeys && removedKeys.length === 0) return;
  let del = supabase.from('schedules').delete().eq('org_id', orgId);
  if (removedKeys) {
    del = del.in('week_key', removedKeys);
  } else if (keys.length) {
    del = del.not('week_key', 'in', `(${keys.map(k => `"${k}"`).join(',')})`);
  }
  const { error: e2 } = await del;
  if (e2) throw e2;
}

// Read-modify-write a single assignment inside one week's schedule blob —
// used by the employee-facing punch clock (clock in/out, self-added ad hoc
// shifts). Unlike App.jsx's debounced syncSchedules above (which pushes the
// manager's ENTIRE locally-held schedules object every ~600ms), this
// re-reads the current server row immediately before writing, touching only
// the one day/block/employee slot involved — so an employee clocking in
// doesn't risk clobbering a manager's unrelated concurrent edit to the same
// week the way overwriting the whole blob from stale local state would.
export async function updateShiftAssignment(orgId, weekKey, day, blockId, empId, patch){
  const { data, error } = await supabase
    .from('schedules').select('data').eq('org_id', orgId).eq('week_key', weekKey).maybeSingle();
  if (error) throw error;
  const current = data?.data || {};
  const scheduleObj = { ...(current.schedule || {}) };
  const dayObj = { ...(scheduleObj[day] || {}) };
  const list = [...(dayObj[blockId] || [])];
  const idx = list.findIndex(a => a.empId === empId);
  if (idx >= 0) list[idx] = { ...list[idx], ...patch };
  else list.push({ empId, ...patch });
  dayObj[blockId] = list;
  scheduleObj[day] = dayObj;
  const nextData = { ...current, schedule: scheduleObj };
  const { error: upErr } = await supabase.from('schedules').upsert(
    { org_id: orgId, week_key: weekKey, data: nextData, status: nextData.confirmed ? 'confirmed' : 'draft' },
    { onConflict: 'org_id,week_key' }
  );
  if (upErr) throw upErr;
  return nextData;
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

// ── Employee documents (manager-only, see 20260725120000_employee_documents.sql) ──
const docFromRow = (r) => ({
  id: r.id, employeeId: r.employee_id, fileName: r.file_name,
  storagePath: r.storage_path, contentType: r.content_type || '',
  sizeBytes: r.size_bytes || 0, uploadedBy: r.uploaded_by || '',
  createdAt: r.created_at,
});

export async function fetchEmployeeDocuments(employeeId){
  const { data, error } = await supabase
    .from('employee_documents').select('*').eq('employee_id', employeeId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(docFromRow);
}

// Uploads to the private employee-documents bucket, then records its
// metadata — two calls, not one, since Storage and the Postgres table are
// separate systems with no single transaction spanning both. If the
// metadata insert fails after a successful upload, the orphaned storage
// object is harmless: nothing ever links to it, so it never appears in the
// UI, it just wastes a little storage quota until manually cleaned up.
export async function uploadEmployeeDocument(orgId, employeeId, file, uploadedBy){
  const path = `${orgId}/${employeeId}/${Date.now()}-${file.name}`;
  const { error: upErr } = await supabase.storage.from('employee-documents').upload(path, file);
  if (upErr) throw upErr;
  const { data, error: insErr } = await supabase.from('employee_documents').insert({
    org_id: orgId, employee_id: employeeId, file_name: file.name,
    storage_path: path, content_type: file.type || null, size_bytes: file.size || null,
    uploaded_by: uploadedBy || null,
  }).select().single();
  if (insErr) throw insErr;
  return docFromRow(data);
}

// Signed URL — the bucket is private, so a plain public URL 404s. Short-
// lived (5 min) since this is only ever used for an immediate open/download
// click, never stored or reused later.
export async function getEmployeeDocumentUrl(storagePath){
  const { data, error } = await supabase.storage.from('employee-documents')
    .createSignedUrl(storagePath, 300);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteEmployeeDocument(doc){
  const { error: rmErr } = await supabase.storage.from('employee-documents').remove([doc.storagePath]);
  if (rmErr) throw rmErr;
  const { error: delErr } = await supabase.from('employee_documents').delete().eq('id', doc.id);
  if (delErr) throw delErr;
}

// Looks up who among `empIds` has push enabled and wants this event, then
// asks the send-push edge function to actually deliver it. Never throws —
// same "fire and forget, log on failure" contract as sendNotificationEmail,
// since a failed push should never block whatever action triggered it.
export async function notifyPush(empIds, event, { title, body, url }){
  try {
    if (!empIds?.length) return;
    const { data: emps, error: empErr } = await supabase
      .from('employees').select('id,push_prefs').in('id', empIds);
    if (empErr) throw empErr;
    const wantIds = (emps || [])
      .filter(e => e.push_prefs?.enabled && e.push_prefs?.[event] !== false)
      .map(e => e.id);
    if (!wantIds.length) return;
    const { data: subs, error: subErr } = await supabase
      .from('push_subscriptions').select('endpoint,p256dh,auth').in('emp_id', wantIds);
    if (subErr) throw subErr;
    if (!subs?.length) return;
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(functionsUrl('send-push'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ subscriptions: subs, payload: { title, body, url } }),
    });
    const json = await res.json().catch(() => ({}));
    if (json.error) throw new Error(json.error);
  } catch (err) {
    console.error('Push notification failed (non-blocking):', err);
  }
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
export async function updateEmployeeSelfProfile(orgId, { name, palIdx, phone, availability, emailNotifications, pushPrefs } = {}){
  // Goes through a database function, not a direct UPDATE on employees.
  //
  // RLS filters ROWS, not COLUMNS, so a "you may edit your own row" policy
  // would also have let someone raise their own max_hours, give themselves the
  // Manager role, or change their kiosk PIN. Column-level GRANTs can't fix that
  // either, because managers and staff share the same `authenticated` database
  // role. update_my_profile whitelists the six presentation columns instead,
  // and works out WHICH row is yours server-side from your session email — the
  // caller no longer names an employee id at all.
  // See 20260804200000_split_for_all_policies.sql.
  const { error } = await supabase.rpc('update_my_profile', {
    p_org:                 orgId,
    p_name:                name ?? null,
    p_pal_idx:             palIdx ?? null,
    p_phone:               phone ?? null,
    p_availability:        availability ?? null,
    p_email_notifications: emailNotifications ?? null,
    p_push_prefs:          pushPrefs ?? null,
  });
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

// ── Currency ──────────────────────────────────────────────────────────────
// Per-org, not per-browser — a restaurant's currency should follow the
// restaurant, not whichever device last had it open. Asked for once at
// creation time (RestaurantPicker); editable afterward from Costs, which
// writes back here (debounced) the same way role_styles does above.
export async function fetchOrgCurrency(orgId){
  const { data, error } = await supabase.from('organizations').select('currency').eq('id', orgId).single();
  if (error) throw error;
  return data?.currency || 'kr';
}

// The restaurant-wide sick pay default. Readable by any member (it's a policy
// number, not personal data); writes to `organizations` are manager-gated by
// RLS, so a staff session simply can't change it.
export async function fetchOrgSickPct(orgId){
  const { data, error } = await supabase.from('organizations').select('sick_pay_pct').eq('id', orgId).single();
  if (error) throw error;
  // ?? not ||, so a restaurant that genuinely pays 0% keeps its 0.
  return data?.sick_pay_pct ?? 100;
}

export async function saveOrgSickPct(orgId, pct){
  const { error } = await supabase.from('organizations').update({ sick_pay_pct: pct }).eq('id', orgId);
  if (error) throw error;
}

export async function saveOrgCurrency(orgId, currency){
  const { error } = await supabase.from('organizations').update({ currency }).eq('id', orgId);
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
// ── Schedule audit trail ─────────────────────────────────────────────────────
// Append-only record of who changed a schedule and when (see
// 20260803140000_schedule_audit.sql). Read is manager-only; insert is
// self-attributed.

// Deliberately never throws and never blocks the edit it describes. A failed
// audit write must not lose someone's actual schedule change — a gap in the
// log is bad, refusing the edit because logging failed is worse. Failures go
// to the console so they're diagnosable rather than invisible.
export async function logScheduleEvent(orgId, { weekKey = null, action, detail = {}, actorName = null }) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from('schedule_audit').insert({
      org_id: orgId,
      week_key: weekKey,
      action,
      detail,
      actor_user_id: user.id,
      actor_name: actorName || user.email || null,
    });
    if (error) console.error('Audit log write failed:', error);
  } catch (err) {
    console.error('Audit log write failed:', err);
  }
}

// Most recent entries first. weekKey narrows to one week; omit it for the
// whole org. Returns [] rather than throwing for a non-manager (RLS gives them
// no read policy), so a caller can render "no history" instead of an error.
export async function fetchScheduleAudit(orgId, weekKey = null, limit = 100) {
  let q = supabase.from('schedule_audit')
    .select('id, week_key, action, detail, actor_name, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(limit);
  // Roster changes (archive/restore/delete) aren't scoped to a week, so they
  // carry a null week_key. Filtering strictly by week would hide them from the
  // per-week History view — which is exactly where someone asks "why is this
  // person no longer on the rota?".
  if (weekKey) q = q.or(`week_key.eq.${weekKey},week_key.is.null`);
  const { data, error } = await q;
  if (error) { console.error('Audit log read failed:', error); return []; }
  return (data || []).map(r => ({
    id: r.id, weekKey: r.week_key, action: r.action,
    detail: r.detail || {}, actorName: r.actor_name || '', createdAt: r.created_at,
  }));
}
