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
171 tests pass" proves nothing.

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

- [ ] **Tighten the remaining org-membership-only tables** — 4/10 — the four
  big ones are done; these are still gated only on "are you in this org":
  `shift_swaps`, `notifications`, `messages`, `message_replies`,
  `schedule_templates`, `push_subscriptions`, `daily_revenue`. Staff
  legitimately write to most of them (claiming shifts, marking things read), so
  each needs the same per-operation treatment rather than a blanket lock.
  **`daily_revenue` first** — staff have no reason to read the restaurant's
  takings at all, so it's the one with a clean answer.
- [ ] **Blanket grants to `authenticated` are a footgun** — 4/10 — `grant
  select, insert, update, delete on all tables … to authenticated` plus `alter
  default privileges … grant … to authenticated` means every FUTURE table is
  fully writable by any logged-in user from the moment it exists. Harmless
  while RLS is on with good policies; the mechanism by which the next hole
  arrives quietly. A new table with RLS left off is wide open from birth.
- [ ] **Commit the first live schema snapshot** — 3/10 — the scaffolding is in
  (`supabase/schema/`: dump script, annotated baseline, README with the
  routine). What's missing is one run of `dump_live_schema.sql` and a commit of
  its output to `live_snapshot.md`, so future diffs have a baseline to diff
  against. Do it now that the policy work has settled.

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

- [ ] **Turn on branch protection so CI actually gates** — 4/10 — the code side
  is done: CI now runs on every branch (not just main) and cancels superseded
  runs, and `DEPLOYING.md` documents the branch → preview → merge flow. **But
  none of it binds until you add the ruleset in GitHub Settings → Branches**
  requiring a PR and the `test-and-build` check on `main`. Until then CI stays
  advisory and pushing to main still ships straight to the restaurant. ~10
  minutes, and only you can do it.
- [ ] **Decide about a preview Supabase project** — 3/10 — deliberately NOT
  done. Preview deployments talk to the real database, so a preview is safe for
  looking at layout and unsafe for archiving someone or publishing a week. A
  second Supabase project would fix that but means keeping two schemas in step.
  At 3 users that trade probably isn't worth it; worth revisiting when a broken
  preview would actually cost something. Documented in `DEPLOYING.md` so it's a
  known trade rather than a surprise.
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
