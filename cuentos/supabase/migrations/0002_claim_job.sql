-- Atomic job claim (2026-08-21).
--
-- The claim used to be a filtered UPDATE from the client:
--
--   update jobs set state='running', locked_until=now()+10min
--    where id=$1 and state in ('pending','running')
--      and (locked_until is null or locked_until < now())
--   returning *
--
-- PostgREST re-applies the filters to the returned rows, and the row it just
-- wrote no longer matches them (locked_until is now in the future), so the
-- update landed but the response was empty. runJob read that as "someone else
-- holds this job" and returned {state:"locked"} every single time: no job ever
-- ran. Unit tests could not see it — they use a fake database.
--
-- A function does the same work in one statement and returns the row it wrote.

create or replace function cuentos.claim_job(p_id uuid, p_minutes int default 10)
returns setof cuentos.jobs
language sql
security invoker
set search_path = ''
as $$
  update cuentos.jobs
     set state = 'running',
         locked_until = now() + make_interval(mins => p_minutes)
   where id = p_id
     and state in ('pending', 'running')
     and (locked_until is null or locked_until < now())
  returning *;
$$;

revoke execute on function cuentos.claim_job(uuid, int) from public, anon, authenticated;
grant execute on function cuentos.claim_job(uuid, int) to service_role;
