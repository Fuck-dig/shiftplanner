# Tasks

## Active

- [ ] **Test overtime/rest warnings, employee documents, and push notifications on rorota.net** - all three shipped and deployed (commit d56063c); overtime/rest warnings confirmed working in the edit-shift modal, documents upload/open/remove confirmed working, push subscribe + toggles confirmed working — still need to confirm actual push delivery fires for: new/changed shifts (confirm schedule), time-off/swap decisions, direct messages, and shift reminders (via the send-shift-reminders cron or a manual curl trigger)
- [ ] **Set up a staging environment / less manual deploy flow** - severity 4/10, from CRITIQUE.md - every change currently goes straight from local edits to production via a manual git push, with no gate in between

## Waiting On

## Someday

- [ ] **Onboarding walkthrough / tutorial** - William's idea, explicitly deferred - a guided first-run tour once someone signs up, not scoped or started yet

## Done

- [x] ~~Add an error boundary~~ (2026-07-28) - wrapped the app root in a top-level ErrorBoundary so an uncaught render error shows a "something went wrong, reload" screen instead of blanking to white
- [x] ~~Give brand-new orgs an empty state instead of fake employees~~ (2026-07-28) - removed the DEFAULT_EMPLOYEES fallback entirely (kept the default Lunch/Dinner coverage blocks as a starter template, since that's a generic template rather than fake personal data); EmployeesView now shows a real "no employees yet" empty state. This only changes what happens when an org's employee list is genuinely empty, so it has zero effect on any org — including Almus — that already has real employees in it.
- [x] ~~Ask for currency when creating a new restaurant~~ (2026-07-28) - currency is now a real per-org database setting (organizations.currency, defaulting to 'kr' so every existing org's behavior is unchanged) instead of a single browser-wide localStorage value shared across all restaurants; the "create restaurant" form now asks for it, and changing it later in Costs saves back to that org.
- [x] ~~Code-split the JS bundle~~ (2026-07-28) - lazy-loaded EmployeeView, KioskView, and the two message modals (each only needed for a subset of sessions); single ~800kB chunk is now a ~375kB main chunk plus several small on-demand ones, and the "chunk >500kB" build warning is gone
- [x] ~~Fix RLS on employee_documents and wages~~ (2026-07-28) - documents: tightened all 6 policies (table + storage) to require an owner/manager membership role, not just org membership. Wages: found this was worse than expected — EmployeeView already downloaded every coworker's wage on ordinary use, just never displayed it, and RLS can't fix that alone since it filters rows not columns. Moved wage/contract_type/contract_period into a new employee_wages table with manager-only RLS (zero policies for a plain employee), backfilled from the existing employees table before dropping those columns from it. Two new migrations to run: 20260728130000_documents_manager_only_rls.sql and 20260728140000_employee_wages.sql (run the second one in one go — it copies data before dropping the old columns).
- [x] ~~Add real test coverage beyond schedule.js + set up CI~~ (2026-08-03) - added dates.test.js (14 tests, incl. Sunday edge cases for getMondayDate/weekOffsetFromDate via fake timers), roles.test.js (10 tests for drag-reorder + merge logic), and html.test.js (6 tests for escapeHtml) - test count went from 43 to 73, all passing. Added .github/workflows/ci.yml which runs npm test + npm run build automatically on every push/PR to main - so a broken build or failing test now gets caught before it reaches production instead of only being noticed manually. (lib/data.js and lib/org.js still untested - they need Supabase client mocking, left for a future pass.)
