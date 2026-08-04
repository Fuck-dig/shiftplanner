# Tasks

<!-- Severity (1-10): how worried to be if this is left as-is.
     1-3 = cosmetic / nice-to-have
     4-6 = a real problem, not urgent
     7-8 = should fix soon
     9-10 = data loss, security, or breakage.

     Completed work lives in CHANGELOG.md, not here. -->

## Verify — needs your hands, not mine

Nothing below can be closed by tests. These are the ones where "it builds and
153 tests pass" proves nothing.

- [ ] **Test the 3 Aug changes** — severity 6/10 — three commits of UI change
  (staff Requests rebuild, archived-staff fix, archive→open-shifts) have had
  **no human eyes on them**. Checklist is in `TESTING-today.md`; 23 steps, ~10
  minutes. Section A is the one that matters — it covers a bug that was live
  for staff. The single most important step is A8: a past shift must still show
  an archived person's real name and colour, or archiving is eating history.
- [ ] **Confirm push notifications actually arrive** — severity 5/10 — subscribe
  and the toggles are confirmed working on rorota.net; *delivery* is not. Needs
  a phone. Four paths to check: new/changed shifts on publish, time-off and swap
  decisions, direct messages, and shift reminders (the `send-shift-reminders`
  cron, or a manual curl).

## Active

- [ ] **Wages are readable by any org member at the database level** — severity
  6/10 — `employee_documents` was tightened to manager-only RLS on 28 Jul, but
  wages are a **column** on `employees`, and Postgres RLS filters rows, not
  columns. Every login shares the same `authenticated` database role, so the
  manager-only wage UI is a gate with nothing behind it: any employee who opens
  devtools and calls the REST endpoint with the anon key that ships in the
  bundle can read every colleague's wage. Fixing it properly means splitting
  wage into its own manager-only table — the larger change that migration
  deliberately deferred.
- [ ] **#4 Undo doesn't survive a reload** — severity 5/10 — reported, not yet
  reproduced. The logic reads correctly (undo writes through the same debounced
  save as any other edit), so I don't want to fix it blind. If it recurs, the
  useful details are: how long after the edit you clicked Undo, and whether the
  change came back immediately on reload or only later.
- [ ] **Staff view has no compact/comfortable density toggle** — severity 4/10 —
  `gridTight` exists in Dashboard and WeekView only. This is the feature you
  specifically asked for a while back; it landed on the manager side and never
  crossed over, so staff are stuck on one density.
- [ ] **Mobile layout** — severity 4/10 — the app is usable on a phone but not
  designed for one. Staff are the people most likely to open it on a phone, and
  the grids assume a wide viewport.
- [ ] **No staging environment** — severity 4/10 — every change goes from local
  edits straight to production via a manual `git push`, with no gate in between.
  Today is the argument for it: three commits shipped untested.
- [ ] **Team view hides an archived person's PAST rows** — severity 3/10 — the
  person-row grids filter archived staff, which is right for upcoming weeks but
  means a finished week shows no row for someone who has since left, even though
  they worked it. Week view (role-based) still shows them, so the history isn't
  lost — the two grids just disagree. Probably wants the filter to depend on
  whether the week is in the past.
- [ ] **Rest-conflict warnings are thinner on the staff side** — severity 3/10 —
  `hasRestConflict` is used 5 times in Dashboard and twice in EmployeeView. Some
  of that gap is legitimate (manager-only editing affordances), but worth
  confirming a staff member sees a too-short turnaround on their own roster
  rather than only the manager seeing it.
- [ ] **Two `react-hooks/set-state-in-effect` errors** — severity 3/10 —
  `App.jsx:73` and `Dashboard.jsx:216`. Real React warnings about cascading
  renders, not lint noise. Left deliberately because both are load-bearing
  bootstrap effects; `lint:ci` still passes because its config gates on the
  rules-of-hooks violations that actually white-screen the app.
- [ ] **Dashboard and EmployeeView mix fetching, logic and rendering** —
  severity 3/10 — 2072 and 1543 lines. Not urgent, but it's why the same bug
  keeps needing fixing twice in two places (archived filtering, `shiftDay`, the
  request rows). Splitting data-fetching out would make the next shared fix a
  single edit.
- [ ] **#11 Gradient/clipping artefacts around the sticky bars** — severity 2/10
  — the fixed-attachment radial gradient clips oddly against borders, most
  visibly on the right edge of the nav. Much cheaper to fix than it was: the
  3 Aug cleanup collapsed six copy-pasted copies into one `backdrop()` in
  `constants.js`, so there's now a single place to change.
- [ ] **`i18n.js` is 2634 lines with all five languages inline** — severity 2/10
  — works fine, and the parity test protects it. Splitting per language would
  make diffs readable, but it's churn with no user-visible payoff.
- [ ] **Delete the stale checkout flow** — severity 2/10 — dead code from an
  earlier direction, still shipping in the bundle.
- [ ] **Fold `TESTING-today.md` into `TESTING.md`** — severity 1/10 — it's a
  scratch file for one day's changes and will be misleading by next week. Do
  this once the test pass above is done.

## Someday

- [ ] **Onboarding walkthrough / tutorial** — severity 3/10 — your idea,
  explicitly deferred. A guided first-run tour after signup. Not scoped.

## Waiting on

*(nothing)*
