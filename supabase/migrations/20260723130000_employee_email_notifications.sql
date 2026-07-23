-- ============================================================================
-- Rorota — per-employee email notification preference
-- ============================================================================
-- Run this once in the Supabase SQL editor for your project (or via
-- `supabase db push`).
--
-- Lets each person opt out of the email companions added alongside in-app
-- notifications (schedule published, time-off decided, shift swaps) from
-- their own Profile page, without affecting the in-app notification bell,
-- which always still fires regardless of this setting.
--
-- Defaults to true (opted in) so existing employees keep getting the emails
-- they already started receiving — this is an opt-out toggle, not opt-in.
-- ============================================================================

alter table employees add column if not exists email_notifications boolean not null default true;
