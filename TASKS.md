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

- [ ] **Tighten the remaining org-membership-only tables** — 4/10 — `daily_revenue` is now done (7 Aug, applied and verified). Still gated only
  on "are you in this org": `shift_swaps`, `notifications`, `messages`,
  `message_replies`, `schedule_templates`, `push_subscriptions`. These are the
  harder half, deliberately left: staff legitimately WRITE to all of them
  (claiming a shift, marking a message read), so each needs per-operation
  thought about which writes to allow rather than the blanket manager-only lock
  `daily_revenue` could take. Don't do them in one sweep — one table at a time,
  each checked against every call in `lib/data.js`.
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

- [ ] **Archiving still leaves upcoming shifts on the rota when you decline** —
  3/10 — DOWNGRADED from 5/10, because the dangerous half is fixed: the shift is
  no longer invisible. `rosterForWeek` now gives an archived person a row in any
  week they actually have a shift, so you can see and remove it. What remains is
  only that `archiveEmp` archives BEFORE the confirm and independently of it, so
  answering Cancel leaves them archived and still rostered — visible now, but
  still a slightly odd state to land in. Fix would be a three-way prompt
  (repost / leave them on / cancel the archive) rather than a yes-no.
- [ ] **#4 Undo doesn't survive a reload** — 5/10 — reported, not yet
  reproduced. The logic reads correctly (undo writes through the same debounced
  save as any other edit), so I don't want to fix it blind. If it recurs, the
  useful details are: how long after the edit you clicked Undo, and whether the
  change came back immediately on reload or only later.
- [ ] **Should an EXISTING rest conflict be visible on the grids?** — 2/10 —
  reframed after checking, because the old entry was wrong. There is no
  staff-vs-manager gap: both sides warn at the moment you'd CREATE a clash
  (manager on edit and on drag, staff on claiming an open shift), and **neither
  grid shows an existing one** once it's there. That's coherent — warn at the
  point of decision — so this is a design question, not a bug. Worth deciding
  deliberately rather than leaving as an accident of where the checks landed.
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

- [ ] **Decide what to do with `20260806140000_fix_accept_invitations_hang.sql`** —
  2/10 — WRITTEN, NOT APPLIED, and not the fix for anything that actually
  happened. It was built on a wrong diagnosis of the 6 Aug outage (see
  CHANGELOG). Its three guards — a 5s `statement_timeout`, an advisory lock and
  `for update skip locked` — are still reasonable defence for a function on the
  boot path, and the client-side `singleFlight` now makes the concurrent-call
  case it was aimed at much rarer. Decide deliberately: apply it as defence in
  depth, or delete it so it doesn't sit around looking like pending work.
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
