-- ============================================================================
-- Rorota — lock avatar colour after first pick
-- ============================================================================
-- Run this once in the Supabase SQL editor for your project (or via
-- `supabase db push`).
--
-- Avatar colour is meant to be a one-time choice made at account setup —
-- once an employee (or manager) has picked their colour, ProfileSettings.jsx
-- locks the picker. That's enforced client-side only (same trust model as
-- the rest of this schema — see 20260721120000's header comment), so this
-- column just tracks whether the pick has happened yet, defaulting to false
-- for all existing rows since no one has explicitly "chosen" their current
-- colour (it was auto-assigned round-robin at creation time).
-- ============================================================================

alter table employees add column if not exists color_set boolean not null default false;
