# Database schema — what's authoritative, and what isn't

## The short version

The **database** is authoritative. This directory exists so that drifting away
from it becomes *visible* rather than invisible.

## Why it exists

On 4 August 2026 two security findings both traced to the same root cause:
things that were in the database but written down nowhere.

- The six core tables (`organizations`, `memberships`, `employees`, `blocks`,
  `time_off`, `schedules`) were created from a dashboard snippet that lived
  only in the Supabase SQL editor.
- The `invitations` policies — the ones behind a **cross-tenant account
  takeover** — appeared in no migration and no saved query at all. They were
  created somewhere that left no record, which is precisely why nobody had ever
  reviewed them. You cannot review what isn't written down.

A snapshot in git does not prevent that by itself. What it buys you is a diff.

## Files

| File | What it is |
|---|---|
| `00_baseline_reference.sql` | The original schema, **for reading only**. The `drop table … cascade` lines have been removed so it can't be run by accident. Annotated with what has since been superseded. |
| `dump_live_schema.sql` | Read-only. Run it in the SQL editor to regenerate the current state. |
| `live_snapshot.md` | Paste the output of the above here and commit it. |

Everything in `../migrations/` is the change history. This directory is the
*state*.

## The routine

After any dashboard change, and before any security review:

1. Run `dump_live_schema.sql` in the Supabase SQL editor.
2. Paste each result into `live_snapshot.md`.
3. `git diff`.

**Anything in that diff you can't account for was created out of band** — which
is the exact category of thing that caused the 4 August incident.

## Two things to look at first in any diff

**Section 3 — RLS on/off.** A table with `rls_enabled = false` is wide open to
every logged-in user no matter what policies exist, because this project grants
blanket DML to `authenticated` (see the grants at the bottom of
`00_baseline_reference.sql`). One `false` there undoes everything else.

**Section 7 — overlapping permissive policies.** Multiple permissive policies
for the same command are **OR'd together**: the loosest one decides. So
tightening a policy does not tighten a table — you have to know every policy on
it. This caught a real problem on 4 August, where a manager-gated write policy
on `organizations` was doing nothing because a dashboard-created permissive one
sat beside it.

**Section 5 — `SECURITY DEFINER` functions.** Each one is a deliberate hole in
the permission model. There should be exactly six:

- `is_member`, `is_manager`, `my_employee_id` — policy helpers
- `create_organization` — makes an org and its owner membership atomically
- `accept_my_invitations` — reads the role off the invitation row so a caller
  can't choose it
- `update_my_profile` — whitelists the six columns a person may change about
  themselves, because RLS filters rows and not columns

Anything else appearing there needs explaining. Also check `search_path` is
pinned to `''` on each: without it, someone able to create objects could shadow
a table and have a definer-owned function write to theirs instead.
