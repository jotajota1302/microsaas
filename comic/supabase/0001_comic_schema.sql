-- MyOwnManga · schema `comic`
--
-- Additive by construction: a new schema in a project that already hosts the
-- RPG, cuentos and several other apps. Nothing here touches `public` or any
-- other schema, and nothing here is reachable by `anon`.
--
-- SHAPE, and why it is not one column per field:
--
-- The obvious table mirrors the job object field by field. It was rejected
-- after counting: six new fields were added to that object in a single
-- afternoon (base_url, paid_at, payment, render_status, render_step, render),
-- and PostgREST rejects an insert naming a column that does not exist. That
-- table would turn every product change into a migration, and a forgotten
-- migration into a payment that is taken and never recorded.
--
-- So: real columns for what is QUERIED — the daily counters, the cron's
-- queues, the lock — and one `job` jsonb for the whole object, which stays the
-- source of truth. Adding a field costs nothing; adding a query costs one
-- generated column and one index.
--
-- `locked_until` is not decoration. Both the viewer and the cron push the same
-- job forward, and without a claim two of them draw the same eight panels at
-- the same time. That is real money, twice.

create schema if not exists comic;

create table if not exists comic.previews (
  token          text primary key,

  -- Mirrored out of `job` for the queries that must not read jsonb.
  status         text        not null default 'pending',
  step           text        not null default 'outline',
  ip_hash        text,
  paid_at        timestamptz,
  render_status  text,

  -- Whoever holds this until this instant is the one advancing the job.
  locked_until   timestamptz,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- Everything, including the fields above. This is the record.
  job            jsonb       not null default '{}'::jsonb
);

comment on table comic.previews is
  'Un pedido de MyOwnManga: la vista previa gratis y, si se paga, el cómic entero. `job` es el registro completo; las columnas son lo que se consulta.';
comment on column comic.previews.locked_until is
  'Reclamado por quien está avanzando el trabajo. Sin esto, el visor y el cron dibujan las mismas viñetas a la vez.';

-- The admin panel, newest first.
create index if not exists previews_created_idx on comic.previews (created_at desc);
-- The per-visitor daily cap.
create index if not exists previews_ip_day_idx on comic.previews (ip_hash, created_at desc);
-- The cron's two queues. Partial, because both are a handful of rows out of many.
create index if not exists previews_pending_idx on comic.previews (created_at)
  where status = 'pending';
create index if not exists previews_rendering_idx on comic.previews (paid_at)
  where paid_at is not null and (render_status is null or render_status not in ('done', 'needs_attention'));

-- RLS on with NO policies: the service role bypasses it, everyone else gets
-- nothing. There is no logged-in user in this product — the token in the link
-- is the whole authorisation, and it is checked by our own handler, never by
-- the database.
alter table comic.previews enable row level security;

revoke all on schema comic from anon, authenticated;
revoke all on all tables in schema comic from anon, authenticated;
revoke all on all functions in schema comic from anon, authenticated;
revoke all on all sequences in schema comic from anon, authenticated;

alter default privileges in schema comic revoke all on tables from anon, authenticated;
alter default privileges in schema comic revoke all on functions from anon, authenticated;
alter default privileges in schema comic revoke all on sequences from anon, authenticated;

grant usage on schema comic to service_role;
grant all on all tables in schema comic to service_role;

-- Panels, covers and the finished PDF. PRIVATE: a panel is a drawing made from
-- a named minor's story and the PDF is something somebody paid for. Both are
-- served by /api/file, which checks the token and, for the PDF, the payment.
insert into storage.buckets (id, name, public, file_size_limit)
values ('comic', 'comic', false, 26214400)
on conflict (id) do update set public = false;
