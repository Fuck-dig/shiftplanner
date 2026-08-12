# Rorota

Shift scheduling for restaurants. Managers build a week's rota, publish it, and
handle time off, swaps and open shifts; staff see their own schedule, book time
off, give shifts away and claim open ones.

Live at [rorota.net](https://rorota.net).

## Stack

- **React 19 + Vite** — no framework, no router; the app is a handful of
  top-level views switched by state
- **Supabase** — auth, Postgres with row-level security, Storage for employee
  documents, and Edge Functions for email/push
- **No CSS files.** Styling is inline, driven by a design-token object (`T`) in
  `src/lib/constants.js`. Light/dark is a swap of that object, so anything
  reading a raw hex instead of a token is a bug.
- **Five languages** (da/de/en/es/fr) in `src/i18n.js`. Key parity across all
  five is enforced by a test, so adding a string to one means adding it to all.

## Running it

```bash
npm install
npm run dev
```

Needs a `.env` with:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_VAPID_PUBLIC_KEY=...     # web push; optional for local work
```

## Before calling a change done

```bash
npm run lint:ci    # hooks + undefined-identifier gate — see below
npm test           # vitest
npm run build
```

**`vite build` passing is not verification.** It does not check for undefined
identifiers, and it does not catch rules-of-hooks violations — a hook placed
below an early `return` builds cleanly and white-screens in production. That
has happened. `lint:ci` is the gate that catches it; run all three.

For a long time this claim was half false: `lint:ci` gated on rules-of-hooks
only, so undefined identifiers passed every check the project had. Two real
ones shipped through it on 11 Aug before `no-undef` was added. If you narrow
that config, keep both rules — they cover the two ways this codebase breaks at
runtime rather than at build time.

## Layout

```
src/
  App.jsx              auth + org gate, lazy-loads the three top-level views
  components/
    Dashboard.jsx      the manager's app
    EmployeeView.jsx   the staff app
    KioskView.jsx      shared punch-in screen
    ui.jsx             shared primitives (Btn, EmpCard, RequestRow, …)
    views/             the manager's tabs (Week, Team, Costs, Coverage, …)
  lib/
    constants.js       design tokens, blocks, availability presets
    schedule.js        scheduling maths — the most heavily tested module
    data.js            every Supabase read/write
    dates.js           week/day arithmetic
  i18n.js              all five languages
supabase/
  migrations/          apply in the Supabase SQL editor; all are re-runnable
  functions/           send-invite, send-notification, send-push,
                       send-shift-reminders
```

## Conventions worth knowing

- **Archiving is not deleting.** An archived employee stays in the `employees`
  array so past shifts keep their name and colour. Use `activeOnly(employees)`
  for anything forward-looking; use the full array for lookups by id.
- **Migrations must be re-runnable.** Postgres has no
  `create policy if not exists`, so every policy is `drop policy if exists`
  first. `supabase/check_migrations.sql` reports which have been applied.
- **The audit table is append-only** — no update or delete policies. Old action
  names must keep their i18n strings, because rows already written still render.
- Comments explain *why*, not *what*. If something looks odd, the comment
  above it usually says which bug it exists to prevent.

## Docs

- `DEPLOYING.md` — branch → preview → merge, and why previews touch real data
- `TASKS.md` — what's left, each item severity-rated 1–10
- `CHANGELOG.md` — what's been done, and why
- `TESTING.md` — manual test passes for manager and staff
- `BRIEFING.md` — architecture and state-of-the-app notes
