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

- [ ] **Finish the test pass — the staff-login half** — 5/10 — the steps now
  live in **`TESTING.md` section 10**, folded in from the old
  `TESTING-today.md` on 7 Aug so there's one checklist rather than a file named
  after a day three weeks ago. The manager side was done on 4 Aug: leave+shift
  shows two cards with the warning border, an archived person's PAST shift
  still renders with their real name and colour, archive/restore persists.
  What's left needs a **staff login**: the whole rebuilt staff Requests tab,
  the manager's approvals queue (needs a pending claim to exist), and archiving
  with **OK** on the prompt — the 4 Aug run answered Cancel, so the
  shifts→open-shifts path has still never actually executed.
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

## Scheduling engine

- [ ] **The generator is still greedy, and greedy is not optimal** — 4/10 —
  DOWNGRADED from 6/10 now that role order no longer decides the rota (roles are
  filled scarcest-first, 7 Aug). What remains is the underlying weakness: each
  role is filled in one pass with no backtracking, so a locally sensible choice
  can still cost a slot elsewhere. Scarcest-first fixes the common case and the
  demonstrated one; it does not promise the best possible rota. A real fix is to
  treat each block as an assignment problem and solve for maximum coverage
  (~60 lines, order-independent AND provably fills the most slots) — the
  trade-off being that "cheapest staff" becomes a preference rather than a
  guarantee, since filling one more slot can mean picking a dearer person.
  Worth doing only if you see rotas leaving slots open that you can fill by
  hand — that's the symptom, and it's the one to look for.
- [ ] **Generate silently replaces a week, including a published one** — 5/10 —
  replaces the entry I wrote yesterday speculating about rest violations against
  existing shifts. That was wrong and is now checked: `generate()` does
  `setSchedules(p=>({...p,[weekKey]:{schedule:s,…}}))`, i.e. it REPLACES the
  week rather than merging into it, so there is nothing for it to conflict with.
  The real problem is what that replacement costs. Pressing Generate on a week
  that already has a schedule discards every manual edit in it, with no
  confirmation — and it does not check `confirmed`, so it will just as happily
  rewrite a week you have already published and staff are planning around.
  Nobody is told; the shifts simply change.
  This is out of step with the app's own conventions: applying a template
  confirms first (`tmpl.applyConfirm`) and so does archiving. The empty-state
  Generate buttons are safe (they only render when no schedule exists), and
  MonthView's per-week button is guarded by `!ws`. It is specifically the main
  toolbar button and its mobile-menu twin that are unguarded.
  Fix: confirm when a schedule already exists, with stronger wording when the
  week is confirmed/published. Cheap, and it protects the most expensive thing
  in the app — a rota someone has hand-tuned.

## Bugs

- [ ] **The add-a-shift modal's Custom row also hardcodes `blocks[0]`** — 3/10 —
  same shortcut that made a custom-hours OPEN shift land on Lunch (fixed 13 Aug
  in the open-shift dialog). Assigning a named person a custom-time shift picks
  the first block silently. Less harmful there, because you can see the result
  land on the rota immediately and the person is named — but it's the same
  guess, and it should ask the same way.


- [ ] **Archiving still leaves upcoming shifts on the rota when you decline** —
  3/10 — DOWNGRADED from 5/10, because the dangerous half is fixed: the shift is
  no longer invisible. `rosterForWeek` now gives an archived person a row in any
  week they actually have a shift, so you can see and remove it. What remains is
  only that `archiveEmp` archives BEFORE the confirm and independently of it, so
  answering Cancel leaves them archived and still rostered — visible now, but
  still a slightly odd state to land in. Fix would be a three-way prompt
  (repost / leave them on / cancel the archive) rather than a yes-no.
- [ ] **Costs' "Staff scheduled — X of N" counts archived people in N** — 3/10
  — found on 7 Aug while reading the tab to explain it, then not written down
  until now, which is how findings get lost. `CostsView` receives the raw
  `employees` array and uses `employees.length` as the denominator, so every
  archived person inflates it — the same family as the Team-view headcount bug
  William caught with "#7 does not drop". The numerator (`workingCount`) is
  fine. Fix is `activeOnly(employees).length` for N, but check the ROWS
  separately: the list itself should keep showing archived people who actually
  worked the period, exactly as `rosterForWeek` does for the grids.
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

- [ ] **Mobile layout — PARKED 7 Aug, pending a real native app** — 3/10 —
  William's call, and a reasonable one: the remaining problems are all the same
  problem, which is a desktop grid being forced into 390px. A native app solves
  that properly instead of by attrition. Everything below is either done or
  deliberately left; nothing here is broken in production.

  **Fixed and shipped 7 Aug:**
  - Team grid header/body scroll desync (shifts appeared under the wrong day)
  - Team grid columns not matching between header and body (`1fr` →
    `minmax(0,1fr)`), which also fixed the tall thin cards
  - Team grid now scrolls like the Week grid — one box, no JS
  - Toolbar down from four rows to two (History/Print/Delete → ☰ menu, search
    collapses to an icon)
  - Costs columns and the Employees action row no longer run off-screen
  - Compact fits the whole week in Team view

  **Deliberately NOT done, with the reason:**
  - **Compact in WEEK view must keep its 972px minimum.** Tried removing it,
    reverted: a Week cell stacks avatar chips plus "+ Add" and "+ Open" per
    role, so at ~40px the content overlaps with nowhere to scroll. Week on a
    phone wants FEWER columns (isolate a day), not thinner ones. There's a
    comment on that line so it doesn't get retried.
  - **Long names wrap** — "Nikolaj Ry" breaks across two lines in the employee
    panel. Cosmetic, untouched.
  - **The bigger idea, if this is ever revisited on the web**: give Week view a
    phone layout that shows one day at a time rather than seven columns. That
    removes horizontal scrolling as a category rather than mitigating it.

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
- [x] **DONE 13 Aug — seven stale eslint-disable directives** — the rules stopped firing; `lint:ci` is now clean of both errors and warnings.
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
## UX and parity

- [ ] **Org settings live in three places** — 3/10 — surfaced by building the
  setup form on 11 Aug. Currency, sick pay and the pay period start are now
  asked at creation, but afterwards they are edited from **Costs** (currency and
  sick pay) with no home at all for the pay period start — you'd have to change
  it in SQL. There is no "restaurant settings" screen; org-level things live
  wherever they happen to be used, which was fine with one setting and isn't
  with four. A small Settings panel (reachable from the Admin menu) that holds
  the same four fields as the setup form would close it, and the setup form
  could then literally be the same component.

## Someday

- [ ] **Onboarding walkthrough / tutorial** — 3/10 — your idea,
  explicitly deferred. A guided first-run tour after signup. Not scoped.

## Waiting on

*(nothing)*
