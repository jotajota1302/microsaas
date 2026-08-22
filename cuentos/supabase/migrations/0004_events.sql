-- First-party cookieless audience measurement.
--
-- The shop knew everything about the funnel from the moment an order exists,
-- and nothing before it. This is the half nobody could see: a visit, the
-- button pressed, the form started, "pay" pressed.
--
-- Deliberately absent: any identifier that survives the visit, any raw IP, any
-- full referrer URL (host only), and anything a person typed. The story token
-- is never stored: /c/<token> is recorded as /c, because that token is the key
-- to somebody's book.
create table if not exists cuentos.events (
  id bigserial primary key,
  at timestamptz not null default now(),
  name text not null,
  path text,
  ref text,
  utm jsonb not null default '{}'::jsonb,
  locale text,
  device text,
  visit text,
  ip_hash text
);

create index if not exists events_at_idx on cuentos.events (at desc);
create index if not exists events_name_at_idx on cuentos.events (name, at desc);

alter table cuentos.events enable row level security;

comment on table cuentos.events is
  'First-party cookieless audience measurement: no persistent identifier, hashed IP for abuse counting only, referrer host without the path.';

-- 0001 said "grant all on ALL TABLES in schema" — a snapshot, not a standing
-- rule. Every table added afterwards starts with no permissions and fails at
-- runtime with "permission denied for table events", which the 204 on
-- /api/track hides by design. The default privileges below stop the next table
-- repeating it.
grant all on cuentos.events to service_role;
grant usage, select on all sequences in schema cuentos to service_role;
alter default privileges in schema cuentos grant all on tables to service_role;
alter default privileges in schema cuentos grant usage, select on sequences to service_role;
