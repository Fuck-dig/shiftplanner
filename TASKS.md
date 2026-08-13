# Tasks

<!-- RESCORED 13 Aug 2026. Rorota is going to be SOLD to other restaurants, so
     these are no longer scored as "how annoying for Almus" but as "how bad
     with a paying customer who is not you".

     Three things moved a lot:
       - anything about tenant isolation, because a leak stops being your data
       - anything that fails SILENTLY, because you will not be there to see it
       - the staff phone experience, because waiters do not own desks

     Severity (1-10):
     1-3 = cosmetic / nice-to-have
     4-6 = a real problem, not urgent
     7-8 = do before a customer depends on it
     9-10 = data loss, a breach, or someone paid the wrong amount.

     Completed work lives in CHANGELOG.md, not here. -->


## Tier 0 — before a second restaurant exists

Not "before launch" in a marketing sense. Before there is a row in the database
belonging to somebody who is not you.

- [ ] **Remove the blanket grants and make RLS the default** — 8/10 —
  `supabase/schema/00_baseline_reference.sql:179` does `grant select, insert,
  update, delete on all tables in schema public to authenticated`, and the
  `alter default privileges` line below it extends that to every table created
  from now on. Today this is harmless: all 11 RLS tables have policies, and 68
  of 68 policies scope by org or by user (checked 13 Aug — the one that looked
  unscoped, `managers update orgs`, goes through `is_manager(id)`). That is a
  genuinely strong position and it is exactly why this is worth protecting.
  The problem is the mechanism, not the state. The next table added without RLS
  is world-writable by any logged-in user from the moment it exists — and the
  person adding it will be you, late, building something a customer asked for.
  Fix: explicit per-table grants, drop the default-privileges line, and add a
  check that fails loudly if any table in `public` has RLS off.

- [ ] **Prove tenant isolation instead of assuming it** — 8/10 — the policies
  look right. Nothing has ever demonstrated that org A cannot read org B's
  rota, wages, messages or documents. Two orgs, two users, one script, every
  table, read AND write. This is the single test that most deserves to exist,
  because it is the one whose failure ends the company rather than annoying
  somebody.

- [ ] **Get legal advice on employee data** — 7/10 — selling means processing
  names, phone numbers, wages and sickness records for people who never agreed
  to anything with you; they are the customer's employees. Sickness in
  particular gets special treatment under GDPR. Needs a privacy policy and a
  data processing agreement with each restaurant. **Not something to take from
  me** — this one needs an actual lawyer.

- [ ] **Error monitoring** — 7/10 — there is none. Today that is survivable
  because you are the only user and you notice. With a customer, a white screen
  at 18:00 on a Friday is something you learn about on Monday, from them, with
  no stack trace. The 6 Aug outage was found because you happened to look.

- [ ] **Backups, and a restore you have actually performed** — 7/10 — Supabase
  takes backups; you have never restored one. An untested restore is a belief,
  not a capability. Losing your own rota is a bad evening. Losing a customer's
  published rota, with no way back, is the end of that relationship.

- [ ] **Generate silently replaces a week, including a published one** — 6/10 —
  UPGRADED from 5. Pressing Generate on a week that already has a schedule
  discards every manual edit, with no confirmation, and does not check
  `confirmed` — so it will rewrite a week staff are already planning around.
  Out of step with the app's own conventions: applying a template confirms
  first, so does archiving. The empty-state buttons are safe (they only render
  with no schedule) and MonthView's per-week button is guarded by `!ws`; it is
  the main toolbar button and its mobile twin. Now a support incident on
  somebody else's rota, not just your own.

- [ ] **A manager editing sick pay in Costs fails silently** — 6/10 — UPGRADED
  from 5. `CostsView` still has its own sick-pay field and takes
  `setOrgSickPct` with no `isOwner` check, so a manager types a percentage,
  watches it change on screen, and has it rejected by the owner-only trigger
  (20260813100000) on the way to the database. The rejection goes nowhere —
  `dSickPct` is `mkDebounce(v=>saveOrgSickPct(orgId,v))` with no `.catch` — so
  nothing is shown and the stale value stays on screen until a reload.
  Two faults, fix together: the missing owner gate, and the swallowed error.
  The second is the real one. **Audit every other write for the same pattern**;
  a save that fails silently is the worst thing to support remotely, because
  the customer says "it didn't save" and you have nothing to look at.

- [ ] **Decide the staff phone story** — 6/10 — UPGRADED from 3 and unparked.
  Parking it was right for Almus, where you can tell people to use a laptop. It
  is not right for a product: managers may sit at a desk, waiters will not, and
  the staff app is the half every employee touches every week. The parked
  reasoning still stands (a desktop grid forced into 390px), and the note that
  Week view on a phone wants FEWER columns rather than thinner ones is still
  the best idea in this file. **Needs a decision from William before any code:**
  a phone layout for the web app, or a real native app.

## Tier 1 — before the tenth restaurant

- [ ] **Tighten the remaining org-membership-only tables** — 6/10 — UPGRADED
  from 4. Still gated only on "are you in this org": `shift_swaps`,
  `notifications`, `messages`, `message_replies`, `schedule_templates`,
  `push_subscriptions`. Deliberately the harder half — staff legitimately WRITE
  to all of them, so each needs per-operation thought rather than the blanket
  manager-only lock `daily_revenue` took. One table at a time, each checked
  against every call in `lib/data.js`. Matters more with multiple tenants, but
  within a single restaurant it is "can a waiter read a manager's messages",
  which is bad without being existential.

- [ ] **A separate Supabase project for previews** — 6/10 — UPGRADED from 3.
  Preview deployments talk to the real database, so a preview is safe for
  looking at layout and unsafe for archiving someone or publishing a week. At
  one restaurant that trade was defensible and is documented in `DEPLOYING.md`.
  Once the real database holds a customer's payroll, testing against it is not
  a trade-off any more.

- [ ] **Component tests, before the big files are split** — 5/10 — 278 tests,
  all of `lib/`, none of any component. Every UI bug found this month was found
  by William in a browser after the gates went green: the staff row showing
  block hours, the pay card in the wrong tab, a modal built inside a `flatMap`,
  the settings form seeded from null, a disabled button dressed as a spinner.
  The tests protect the arithmetic and nothing anyone touches. This is also the
  precondition for the Dashboard/EmployeeView split below — restructuring 4000
  lines with only lint and the build watching is the riskiest thing on the list.

- [ ] **Billing** — 5/10 — does not exist. Not hard, but nothing about the app
  currently knows what a paying account is.

- [ ] **Onboarding walkthrough** — 4/10 — William's idea, previously "someday".
  Worth more now: nobody will be sitting next to the next restaurant explaining
  what a block is.

## Verify — needs your hands, not mine

Nothing here can be closed by tests.

- [ ] **Finish the test pass — the staff-login half** — 5/10 — steps in
  `TESTING.md` section 10. The manager side was done 4 Aug. What is left needs a
  **staff login**: the rebuilt staff Requests tab, the manager's approvals queue
  (needs a pending claim to exist), and archiving with **OK** on the prompt —
  the 4 Aug run answered Cancel, so the shifts→open-shifts path has still never
  executed. Also the open-shift round trip: post 18:00–22:00, claim it, approve
  it, confirm it lands with those hours.
- [ ] **Confirm push notifications actually arrive** — 5/10 — subscribing works
  on rorota.net; *delivery* has never been confirmed. Needs a phone. Four paths:
  shift changes on publish, time-off and swap decisions, direct messages, and
  the `send-shift-reminders` cron.
- [ ] **Verify the PeriodNav extraction renders** — 3/10 — 13 Aug. Arrows in
  Week, Month and Team, with and without a day isolated; the date picker; Today
  from both the manager and staff schedules. Lint and the build passed, but
  nothing automated has seen it render.

## Bugs

- [ ] **Open shifts are invisible in Week view for a role the block doesn't
  staff** — 4/10 — found 13 Aug. `WeekView` only draws a role row when the block
  REQUIRES that role or somebody is assigned to it (`anyDay`, line ~457). An
  open shift is neither — it lives in `swaps`. So posting a Waiter shift on a
  day Lunch needs no waiters puts it on the rota where the manager cannot see
  it. Team view is fine (it has a dedicated Open shifts row).
- [ ] **The add-a-shift modal's Custom row hardcodes `blocks[0]`** — 3/10 — the
  same shortcut fixed in the open-shift dialog on 13 Aug. Assigning a named
  person custom hours silently picks the first block. Should ask the same way:
  block first, hours fenced to it.
- [ ] **Costs' "Staff scheduled — X of N" counts archived people in N** — 3/10
  — `CostsView` uses raw `employees.length`. Fix is `activeOnly(employees)
  .length` for N, but keep the ROWS showing archived people who actually worked
  the period, as `rosterForWeek` does for the grids.
- [ ] **Archiving leaves upcoming shifts when you decline** — 3/10 — the
  dangerous half is fixed (the shift is no longer invisible). What remains:
  `archiveEmp` archives BEFORE the confirm and independently of it, so Cancel
  leaves them archived and still rostered. Wants a three-way prompt.
- [ ] **#4 Undo doesn't survive a reload** — 5/10 — reported, never reproduced.
  The logic reads correctly, so I don't want to fix it blind. If it recurs:
  how long after the edit, and did the change come back immediately or later.
- [ ] **Should an EXISTING rest conflict be visible on the grids?** — 2/10 — a
  design question, not a bug. Both sides warn when you would CREATE a clash;
  neither shows one that already exists. Coherent, but decide deliberately.
- [ ] **#11 Gradient/clipping artefacts around the sticky bars** — 2/10 — one
  `backdrop()` in `constants.js` to change now.

## Scheduling engine

- [ ] **The generator is greedy, and greedy is not optimal** — 4/10 — roles are
  filled scarcest-first (7 Aug), which fixed the common case; each role is still
  filled in one pass with no backtracking, so a locally sensible choice can cost
  a slot elsewhere. A real fix treats each block as an assignment problem and
  solves for maximum coverage (~60 lines, order-independent, provably fills the
  most slots) — the trade being that "cheapest staff" becomes a preference. Do
  it only if you see rotas leaving slots open you can fill by hand. That is the
  symptom to watch for.

## Code health

Do it when it stops a bug repeating, not for tidiness.

- [ ] **Dashboard and EmployeeView mix fetching, logic and rendering** — 3/10 —
  2245 and 1708 lines, both GROWING (2072 and 1543 when this was written). It is
  why the same bug keeps needing fixing twice. Blocked on component tests above.
- [ ] **`i18n.js` is 3014 lines with all five languages inline** — 2/10 — works,
  and the parity test protects it. Churn with no user-visible payoff.
- [ ] **Two `react-hooks/set-state-in-effect` errors** — 3/10 — `App.jsx:73`
  and `Dashboard.jsx:216`. Real warnings about cascading renders, left
  deliberately: both are load-bearing bootstrap effects.

## Infrastructure

- [ ] **Commit the first live schema snapshot** — 3/10 — scaffolding is in
  (`supabase/schema/`). Missing: one run of `dump_live_schema.sql` and a commit
  of the output, so future diffs have a baseline.
- [ ] **Decide what to do with `20260806140000_fix_accept_invitations_hang.sql`**
  — 2/10 — WRITTEN, NOT APPLIED, and not the fix for anything that happened. Its
  guards are still reasonable defence for a function on the boot path. Apply it
  or delete it, but stop letting it look like pending work.

## Parked

- [ ] **Mobile layout for the manager grids** — 3/10 — parked 7 Aug and STILL
  parked; only the staff half was promoted to Tier 0. Fixed and shipped 7 Aug:
  Team grid scroll desync, header/body column mismatch (`1fr` →
  `minmax(0,1fr)`), Team scrolling like Week, toolbar four rows to two, Costs
  and Employees no longer running off-screen, compact fitting the whole week.
  Deliberately not done: **compact in WEEK view keeps its 972px minimum** —
  tried removing it, reverted, a Week cell stacks avatars plus "+ Add" and
  "+ Open" per role and overlaps at ~40px with nowhere to scroll. There is a
  comment on that line so it is not retried. Long names wrap; cosmetic.
