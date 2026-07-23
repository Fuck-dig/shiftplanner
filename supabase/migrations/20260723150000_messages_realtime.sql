-- ============================================================================
-- Rorota — enable realtime for direct messages
-- ============================================================================
-- Run this once in the Supabase SQL editor for your project (or via
-- `supabase db push`), after 20260723140000_direct_messages.sql.
--
-- Creating a table does NOT automatically push live updates to clients —
-- Postgres changes only reach the app if the table is added to the
-- `supabase_realtime` publication. Without this, messages/replies still
-- work fine, they just only show up on the next 45s poll instead of
-- instantly (the client code has that poll as a fallback either way).
--
-- RLS still applies to realtime the same as it does to normal reads, so
-- this doesn't loosen who can see what — it only affects delivery speed.
-- ============================================================================

alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table message_replies;
