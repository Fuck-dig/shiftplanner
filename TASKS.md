# Tasks

<!-- Severity (1-10): how worried to be if this is left as-is.
     1-3 = cosmetic / nice-to-have
     4-6 = a real problem, not urgent
     7-8 = should fix soon
     9-10 = data loss, security, or breakage.

     Grouped by theme; within a theme, most serious first.
     Completed work lives in CHANGELOG.md, not here. -->


## Verify — needs your hands, not mine

Nothing here can be closed by tests. These are the ones where "it builds and
163 tests pass" proves nothing.

- [ ] **Finish the test pass — sections B and D** — 5/10 — the manager side is
  done (4 Aug). Passed: leave+shift shows two cards with the warning border;
  A8 confirmed, an archived person's PAST shift still renders with their real
  name and colour; archive/restore persists. Still untested because they need
  a **staff login**: section B (the whole rebuilt staff Requests tab) and
  section D steps 22–23 (the manager's approvals queue, which needs a pending
  claim to exist). Also still untested: archiving with **OK** on the prompt —
  the run on 4 Aug answered Cancel, so the shifts→open-shifts path has never
  actually executed.
- [ ] **Confirm push notifications actually arrive** — 5/10 — subscribe
  and the toggles are confirmed working on rorota.net; *delivery* is not. Needs
  a phone. Four paths to check: new/changed shifts on publish, time-off and swap
  decisions, direct messages, and shift reminders (the `send-shift-reminders`
  cron, or a manual curl).

## Security

- [ ] **Split the `for all` policies on employees / blocks / schedules / time_off**
  — 7/10 — from the base schema. `for all using (is_member(org_id))` means any
  employee can, via the REST API: approve their own time off (`status` is just
  a column), delete every schedule, or rewrite anyone's roles and max hours.
  The manager-only UI is the only thing stopping them, and it isn't a control.
  Staff genuinely need INSERT/DELETE on their own `time_off` rows and UPDATE on
  their own `employees` row, so this needs care rather than a blanket lockdown.
- [ ] **Get the live schema into version control** — 5/10 — the base tables and
  several policies exist only in the dashboard. Both security findings today
  came from things the repo didn't contain. `supabase/audit_security.sql` dumps
  the real state; the output should be committed and kept current.
- [ ] **Any employee can rename the org and rewrite its settings** — 4/10 —
  `"members update orgs" for update using (is_member(id))`, including the
  settings JSON.
- [ ] **Blanket grants to `authenticated` are a footgun** — 4/10 — `grant
  select, insert, update, delete on all tables … to authenticated` plus `alter
  default privileges … grant … to authenticated` means every FUTURE table is
  fully writable by any logged-in user the moment it exists. Harmless while RLS
  is enabled with good policies; the mechanism by which the next hole arrives
  silently.

## Bugs

- [ ] **Declining the archive prompt strands an invisible shift** — 5/10 —
  `archiveEmp` archives the person *before* the confirm and independently of
  it, so answering Cancel to "post their upcoming shifts as open shifts?"
  leaves them archived **and** still rostered. Seen live: Lars Lang sat in
  Former Staff while still holding Sat 8 Aug Dinner. The trap is that Team view
  filters archived people, so their row is gone — the shift cannot be seen or
  removed in the person-oriented view at all, only in Week view. Options: keep
  the row while they hold upcoming assignments, warn on decline, or make it a
  three-way choice (repost / leave them on / cancel the archive).

- [ ] **#4 Undo doesn't survive a reload** — 5/10 — reported, not yet
  reproduced. The logic reads correctly (undo writes through the same debounced
  save as any other edit), so I don't want to fix it blind. If it recurs, the
  useful details are: how long after the edit you clicked Undo, and whether the
  change came back immediately on reload or only later.
- [ ] **Team view hides an archived person's PAST rows** — 3/10 — the
  person-row grids filter archived staff, which is right for upcoming weeks but
  means a finished week shows no row for someone who has since left, even though
  they worked it. Week view (role-based) still shows them, so the history isn't
  lost — the two grids just disagree. Probably wants the filter to depend on
  whether the week is in the past.
- [ ] **Rest-conflict warnings are thinner on the staff side** — 3/10 — `hasRestConflict` is used 5 times in Dashboard and twice in EmployeeView. Some
  of that gap is legitimate (manager-only editing affordances), but worth
  confirming a staff member sees a too-short turnaround on their own roster
  rather than only the manager seeing it.
- [ ] **#11 Gradient/clipping artefacts around the sticky bars** — 2/10 — the fixed-attachment radial gradient clips oddly against borders, most
  visibly on the right edge of the nav. Much cheaper to fix than it was: the
  3 Aug cleanup collapsed six copy-pasted copies into one `backdrop()` in
  `constants.js`, so there's now a single place to change.

## UX and parity

Things the manager has that staff do not, and vice versa.

- [ ] **Staff view has no compact/comfortable density toggle** — 4/10 — `gridTight` exists in Dashboard and WeekView only. This is the feature you
  specifically asked for a while back; it landed on the manager side and never
  crossed over, so staff are stuck on one density.
- [ ] **Mobile layout** — 4/10 — the app is usable on a phone but not
  designed for one. Staff are the people most likely to open it on a phone, and
  the grids assume a wide viewport.

## Infrastructure

- [ ] **No staging environment** — 4/10 — every change goes from local
  edits straight to production via a manual `git push`, with no gate in between.
  Today is the argument for it: three commits shipped untested.
- [ ] **Two `react-hooks/set-state-in-effect` errors** — 3/10 — `App.jsx:73` and `Dashboard.jsx:216`. Real React warnings about cascading
  renders, not lint noise. Left deliberately because both are load-bearing
  bootstrap effects; `lint:ci` still passes because its config gates on the
  rules-of-hooks violations that actually white-screen the app.

## Code health

None of this is user-visible. Do it when it stops a bug repeating, not for tidiness.

- [ ] **Dashboard and EmployeeView mix fetching, logic and rendering** — 3/10 — 2072 and 1543 lines. Not urgent, but it's why the same bug
  keeps needing fixing twice in two places (archived filtering, `shiftDay`, the
  request rows). Splitting data-fetching out would make the next shared fix a
  single edit.
- [ ] **Delete the stale checkout flow** — 2/10 — dead code from an
  earlier direction, still shipping in the bundle.
- [ ] **`i18n.js` is 2634 lines with all five languages inline** — 2/10 — works fine, and the parity test protects it. Splitting per language would
  make diffs readable, but it's churn with no user-visible payoff.
- [ ] **Fold `TESTING-today.md` into `TESTING.md`** — 1/10 — it's a
  scratch file for one day's changes and will be misleading by next week. Do
  this once the test pass above is done.

## Someday

- [ ] **Onboarding walkthrough / tutorial** — 3/10 — your idea,
  explicitly deferred. A guided first-run tour after signup. Not scoped.

## Waiting on

*(nothing)*
