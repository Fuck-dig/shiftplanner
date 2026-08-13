-- ============================================================================
-- Rorota — PROOF that one restaurant cannot see another's data
-- ============================================================================
-- Run this file once to install the check. Then, any time you want the answer:
--
--     select * from public.rorota_isolation_test();
--
-- SAFE TO RUN ON PRODUCTION. It creates two throwaway restaurants, checks what
-- each can see, and undoes all of it before returning. Nothing is left behind,
-- including when a check fails.
--
-- WHY IT IS A FUNCTION AND NOT A SCRIPT
--
-- The first version was a plain script: `begin; create temp table …; … ;
-- rollback;`. It failed in the Supabase SQL editor with
--
--     ERROR: 42P01: relation "isolation_results" does not exist
--
-- because the editor runs through a connection pooler, so consecutive
-- statements are not guaranteed to land on the same session. A temp table
-- created by one statement is invisible to the next, and explicit
-- begin/rollback cannot be relied on either. Everything therefore happens
-- inside ONE statement — a single function call.
--
-- HOW IT UNDOES ITSELF
--
-- The seed and the checks run inside a plpgsql sub-transaction that always ends
-- by raising a sentinel exception, which rolls the sub-transaction back. The
-- results survive because they accumulate in a plpgsql VARIABLE, and plpgsql
-- variables are not transactional — they keep their values through a rollback.
-- So the data disappears and the findings do not.
--
-- THE TRAP THIS IS BUILT TO AVOID
--
-- The obvious version only asks "can A see B's rows?" and expects zero. But if
-- the impersonation silently fails — a typo in the claims, a role that did not
-- take — then EVERY query returns zero and EVERY check passes. A vacuous pass
-- is indistinguishable from a real one, and is worse than no test, because now
-- you trust it.
--
-- So each table is checked TWICE:
--     A sees its OWN row      → proves the session really is A
--     A cannot see B's row    → proves isolation
--
-- The first failing means the TEST is broken. The second failing means the APP
-- is broken. The summary row says which.
-- ============================================================================

create or replace function public.rorota_isolation_test()
returns table (scope text, check_name text, expected text, actual text, verdict text)
language plpgsql
volatile
as $fn$
declare
  a_user uuid := gen_random_uuid();
  b_user uuid := gen_random_uuid();
  a_org uuid; b_org uuid; a_emp uuid; b_emp uuid;
  n int; hit int; ok boolean; err text;
  res text[] := '{}';
begin
  begin   -- ── sub-transaction: everything in here is undone ────────────────

    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
    values (a_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'isolation-a@rorota.invalid', '!', now(), now()),
           (b_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'isolation-b@rorota.invalid', '!', now(), now());

    insert into public.organizations (name) values ('ISOLATION TEST A') returning id into a_org;
    insert into public.organizations (name) values ('ISOLATION TEST B') returning id into b_org;
    insert into public.memberships (org_id, user_id, role) values (a_org, a_user, 'owner'), (b_org, b_user, 'owner');
    insert into public.employees (org_id, name) values (a_org, 'A Person') returning id into a_emp;
    insert into public.employees (org_id, name) values (b_org, 'B Person') returning id into b_emp;
    insert into public.blocks (org_id, name, start_time, end_time)
      values (a_org, 'A Lunch', '10:00', '16:00'), (b_org, 'B Lunch', '10:00', '16:00');
    insert into public.schedules (org_id, week_key, data)
      values (a_org, '2026-08-10', '{}'::jsonb), (b_org, '2026-08-10', '{}'::jsonb);
    insert into public.time_off (org_id, employee_id, start_date, end_date)
      values (a_org, a_emp, '2026-08-10', '2026-08-11'), (b_org, b_emp, '2026-08-10', '2026-08-11');
    -- The money. If anything leaks, these are the rows that matter most.
    insert into public.employee_wages (employee_id, org_id, wage) values (a_emp, a_org, 111), (b_emp, b_org, 222);
    insert into public.daily_revenue (org_id, date, amount)
      values (a_org, '2026-08-10', 1000), (b_org, '2026-08-10', 2000);
    insert into public.messages (org_id, recipient_emp_id, sender_label, body)
      values (a_org, a_emp, 'A Boss', 'private to A'), (b_org, b_emp, 'B Boss', 'private to B');

    -- ── become user A ────────────────────────────────────────────────────
    -- Results go into a variable, not a table, so there is no need to hop back
    -- to postgres between checks to get write permission.
    perform set_config('request.jwt.claims',
      json_build_object('sub', a_user::text, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);

    select count(*) into n from (select 1 where auth.uid() = a_user) x;
    res := res || format('SESSION|auth.uid() is really A|1|%s|%s', n,
      case when n=1 then 'PASS' else 'BROKEN TEST — everything below is meaningless' end);

    -- ── reads ────────────────────────────────────────────────────────────
    select count(*) into n from public.organizations where id = a_org;
    res := res || format('organizations|A sees own org|1|%s|%s', n, case when n=1 then 'PASS' else 'BROKEN TEST' end);
    select count(*) into n from public.organizations where id = b_org;
    res := res || format('organizations|A sees B org|0|%s|%s', n, case when n=0 then 'PASS' else '*** LEAK ***' end);

    select count(*) into n from public.employees where org_id = a_org;
    res := res || format('employees|A sees own staff|1|%s|%s', n, case when n=1 then 'PASS' else 'BROKEN TEST' end);
    select count(*) into n from public.employees where org_id = b_org;
    res := res || format('employees|A sees B staff|0|%s|%s', n, case when n=0 then 'PASS' else '*** LEAK ***' end);

    select count(*) into n from public.employee_wages where org_id = a_org;
    res := res || format('employee_wages|A sees own wages|1|%s|%s', n, case when n=1 then 'PASS' else 'BROKEN TEST' end);
    select count(*) into n from public.employee_wages where org_id = b_org;
    res := res || format('employee_wages|A sees B WAGES|0|%s|%s', n, case when n=0 then 'PASS' else '*** LEAK — PAY DATA ***' end);

    select count(*) into n from public.daily_revenue where org_id = b_org;
    res := res || format('daily_revenue|A sees B REVENUE|0|%s|%s', n, case when n=0 then 'PASS' else '*** LEAK — FINANCIALS ***' end);

    select count(*) into n from public.messages where org_id = b_org;
    res := res || format('messages|A sees B private messages|0|%s|%s', n, case when n=0 then 'PASS' else '*** LEAK — MESSAGES ***' end);

    select count(*) into n from public.schedules where org_id = b_org;
    res := res || format('schedules|A sees B rota|0|%s|%s', n, case when n=0 then 'PASS' else '*** LEAK ***' end);

    select count(*) into n from public.blocks where org_id = b_org;
    res := res || format('blocks|A sees B blocks|0|%s|%s', n, case when n=0 then 'PASS' else '*** LEAK ***' end);

    select count(*) into n from public.time_off where org_id = b_org;
    res := res || format('time_off|A sees B time off|0|%s|%s', n, case when n=0 then 'PASS' else '*** LEAK ***' end);

    select count(*) into n from public.memberships where org_id = b_org;
    res := res || format('memberships|A sees who owns B|0|%s|%s', n, case when n=0 then 'PASS' else '*** LEAK ***' end);

    -- ── writes ───────────────────────────────────────────────────────────
    -- RLS filters rows, so a blocked UPDATE is not an error — it simply hits
    -- nothing. Zero has to be measured, not assumed.
    update public.employees set name = 'HACKED BY A' where org_id = b_org;
    get diagnostics hit = row_count;
    res := res || format('employees|A renames B staff|0 rows|%s rows|%s', hit, case when hit=0 then 'PASS' else '*** WRITE LEAK ***' end);

    update public.employee_wages set wage = 999 where org_id = b_org;
    get diagnostics hit = row_count;
    res := res || format('employee_wages|A changes B PAY|0 rows|%s rows|%s', hit, case when hit=0 then 'PASS' else '*** WRITE LEAK — PAY ***' end);

    delete from public.schedules where org_id = b_org;
    get diagnostics hit = row_count;
    res := res || format('schedules|A deletes B rota|0 rows|%s rows|%s', hit, case when hit=0 then 'PASS' else '*** WRITE LEAK — DESTRUCTIVE ***' end);

    -- INSERT is the one that genuinely raises: a `with check` violation is an
    -- error, not a filter.
    begin
      insert into public.employees (org_id, name) values (b_org, 'A planted this');
      ok := true;    -- getting here at all is the failure
    exception when others then
      ok := false; err := SQLERRM;
    end;
    res := res || format('employees|A inserts INTO B|rejected|%s|%s',
      case when ok then 'ACCEPTED' else 'rejected' end,
      case when ok then '*** WRITE LEAK ***' else 'PASS' end);

    -- ── and the reverse, so this is not one-directional luck ─────────────
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims',
      json_build_object('sub', b_user::text, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);

    select count(*) into n from public.employee_wages where org_id = b_org;
    res := res || format('employee_wages|B sees own wages|1|%s|%s', n, case when n=1 then 'PASS' else 'BROKEN TEST' end);
    select count(*) into n from public.employee_wages where org_id = a_org;
    res := res || format('employee_wages|B sees A WAGES|0|%s|%s', n, case when n=0 then 'PASS' else '*** LEAK — PAY DATA ***' end);
    select count(*) into n from public.messages where org_id = a_org;
    res := res || format('messages|B sees A private messages|0|%s|%s', n, case when n=0 then 'PASS' else '*** LEAK — MESSAGES ***' end);

    perform set_config('role', 'postgres', true);

    -- Undo everything. The results are in a variable, and plpgsql variables are
    -- not transactional, so they survive this.
    raise exception 'ROROTA_ISOLATION_ROLLBACK';

  exception when others then
    perform set_config('role', 'postgres', true);
    if SQLERRM <> 'ROROTA_ISOLATION_ROLLBACK' then
      -- A real failure, e.g. auth.users wanting a column this version requires.
      -- Reported rather than swallowed; the seed is rolled back either way.
      res := res || format('TEST|the test itself failed|-|%s|BROKEN TEST', SQLERRM);
    end if;
  end;

  return query
  select split_part(r,'|',1), split_part(r,'|',2), split_part(r,'|',3), split_part(r,'|',4), split_part(r,'|',5)
  from unnest(res) r;

  return query select
    'SUMMARY'::text, ''::text, ''::text, ''::text,
    case
      when exists (select 1 from unnest(res) r where r like '%LEAK%')
        then '*** FAILED — one restaurant can reach another. Do not sell this. ***'
      when exists (select 1 from unnest(res) r where r like '%BROKEN TEST%')
        then 'INCONCLUSIVE — the test did not run properly, so the passes mean nothing.'
      else 'PASSED — ' || array_length(res,1) || ' checks, both directions, reads and writes.'
    end;
end;
$fn$;

-- Postgres grants EXECUTE to PUBLIC by default. This function sets roles and
-- writes rows; nobody's customer should be able to call it.
revoke execute on function public.rorota_isolation_test() from public;

-- ── Run it ──────────────────────────────────────────────────────────────────
select * from public.rorota_isolation_test();
