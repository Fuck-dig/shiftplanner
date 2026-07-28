# Tasks

## Active

- [ ] **Test overtime/rest warnings, employee documents, and push notifications on rorota.net** - all three shipped and deployed (commit d56063c); overtime/rest warnings confirmed working in the edit-shift modal, documents upload/open/remove confirmed working, push subscribe + toggles confirmed working — still need to confirm actual push delivery fires for: new/changed shifts (confirm schedule), time-off/swap decisions, direct messages, and shift reminders (via the send-shift-reminders cron or a manual curl trigger)
- [ ] **Fix RLS so only managers can read/delete employee_documents (and wages)** - severity 7/10, from CRITIQUE.md - RLS currently only checks org membership, not role, so any logged-in employee can hit the Supabase API directly and read/delete a coworker's uploaded documents or see wages, even though the UI hides those screens from non-managers
- [ ] **Add real test coverage beyond schedule.js + set up CI** - severity 5/10, from CRITIQUE.md - only 43 tests exist, all for scheduling math; nothing tests the data layer, UI, or this session's features (push/documents/warnings), and nothing runs the existing tests automatically
- [ ] **Set up a staging environment / less manual deploy flow** - severity 4/10, from CRITIQUE.md - every change currently goes straight from local edits to production via a manual git push, with no gate in between
- [ ] **Code-split the JS bundle** - severity 2/10, from CRITIQUE.md - single ~760kB chunk today; not urgent but will matter more as the app grows

## Waiting On

## Someday

- [ ] **Onboarding walkthrough / tutorial** - William's idea, explicitly deferred - a guided first-run tour once someone signs up, not scoped or started yet

## Done

- [x] ~~Add an error boundary~~ (2026-07-28) - wrapped the app root in a top-level ErrorBoundary so an uncaught render error shows a "something went wrong, reload" screen instead of blanking to white
- [x] ~~Give brand-new orgs an empty state instead of fake employees~~ (2026-07-28) - removed the DEFAULT_EMPLOYEES fallback entirely (kept the default Lunch/Dinner coverage blocks as a starter template, since that's a generic template rather than fake personal data); EmployeesView now shows a real "no employees yet" empty state. This only changes what happens when an org's employee list is genuinely empty, so it has zero effect on any org — including Almus — that already has real employees in it.
- [x] ~~Ask for currency when creating a new restaurant~~ (2026-07-28) - currency is now a real per-org database setting (organizations.currency, defaulting to 'kr' so every existing org's behavior is unchanged) instead of a single browser-wide localStorage value shared across all restaurants; the "create restaurant" form now asks for it, and changing it later in Costs saves back to that org.
