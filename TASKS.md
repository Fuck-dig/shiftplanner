# Tasks

## Active

- [ ] **Test overtime/rest warnings, employee documents, and push notifications on rorota.net** - all three shipped and deployed (commit d56063c); overtime/rest warnings confirmed working in the edit-shift modal, documents upload/open/remove confirmed working, push subscribe + toggles confirmed working — still need to confirm actual push delivery fires for: new/changed shifts (confirm schedule), time-off/swap decisions, direct messages, and shift reminders (via the send-shift-reminders cron or a manual curl trigger)
- [ ] **Fix RLS so only managers can read/delete employee_documents (and wages)** - severity 7/10, from CRITIQUE.md - RLS currently only checks org membership, not role, so any logged-in employee can hit the Supabase API directly and read/delete a coworker's uploaded documents or see wages, even though the UI hides those screens from non-managers
- [ ] **Give brand-new orgs an empty state instead of 12 fake Danish employees** - severity 4/10, from CRITIQUE.md - new orgs currently fall back to a hardcoded demo roster (DEFAULT_EMPLOYEES) that looks like real data; if the owner edits even one entry before deleting the rest, the fake roster gets synced into their real database
- [ ] **Add real test coverage beyond schedule.js + set up CI** - severity 5/10, from CRITIQUE.md - only 43 tests exist, all for scheduling math; nothing tests the data layer, UI, or this session's features (push/documents/warnings), and nothing runs the existing tests automatically
- [ ] **Set up a staging environment / less manual deploy flow** - severity 4/10, from CRITIQUE.md - every change currently goes straight from local edits to production via a manual git push, with no gate in between
- [ ] **Code-split the JS bundle** - severity 2/10, from CRITIQUE.md - single ~760kB chunk today; not urgent but will matter more as the app grows

## Waiting On

## Someday

## Done

- [x] ~~Add an error boundary~~ (2026-07-28) - wrapped the app root in a top-level ErrorBoundary so an uncaught render error shows a "something went wrong, reload" screen instead of blanking to white
