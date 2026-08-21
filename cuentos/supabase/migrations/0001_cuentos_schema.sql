-- cuentos · schema v1 (2026-08-21) — digital-only funnel: script -> sample -> full
-- Shared Supabase project: everything lives in its own schema, RLS on every
-- table, service-role only except the public colouring gallery.

create schema if not exists cuentos;

-- One row per story request. `personalization` holds the child's data and is
-- nulled by the purge once the story expires (7 days unpaid, 30 paid).
create table cuentos.orders (
  id               uuid primary key default gen_random_uuid(),
  email            text not null,
  locale           text not null default 'es' check (locale in ('es', 'en')),
  product          text not null default 'pdf' check (product in ('pdf', 'pdf_en', 'credits')),
  price_cents      int  not null,
  vat_rate         numeric not null,
  personalization  jsonb,
  status           text not null default 'script'
                   check (status in ('script', 'sample', 'paid', 'needs_review', 'delivered', 'refunded', 'failed', 'expired')),
  needs_review     boolean not null default false,
  channel          text not null default 'web' check (channel in ('web', 'etsy')),
  external_ref     text,            -- Etsy receipt id or Stripe session id
  ip_hash          text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index orders_email_created_idx on cuentos.orders (email, created_at desc);
create index orders_created_idx on cuentos.orders (created_at desc);

-- The story itself and the temporary URL that shows it.
create table cuentos.stories (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null unique references cuentos.orders(id) on delete cascade,
  token           text not null unique,
  stage           text not null default 'script' check (stage in ('script', 'sample', 'full')),
  story           jsonb not null,
  people_count    int  not null default 0,
  revisions       int  not null default 0,          -- "cambiar algo" rounds used
  instructions    jsonb not null default '[]'::jsonb,
  retouched       boolean not null default false,
  sheet_path      text,
  page_paths      jsonb not null default '{}'::jsonb, -- { "0": "stories/<token>/p01.png", ... }
  coloring_paths  jsonb not null default '[]'::jsonb,
  pdf_path        text,
  fallbacks       int  not null default 0,
  reminder_sent_at timestamptz,
  expires_at      timestamptz not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index stories_expires_idx on cuentos.stories (expires_at);

-- Resumable work. One job per stage transition; steps are persisted so a
-- crash resumes where it stopped.
create table cuentos.jobs (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references cuentos.orders(id) on delete cascade,
  story_id      uuid references cuentos.stories(id) on delete cascade,
  kind          text not null check (kind in ('script', 'sample', 'full', 'retouch')),
  state         text not null default 'pending'
                check (state in ('pending', 'running', 'done', 'needs_review', 'failed')),
  steps         jsonb not null default '{}'::jsonb,
  input         jsonb not null default '{}'::jsonb,
  attempts      int  not null default 0,
  cost_cents    int  not null default 0,
  error         text,
  locked_until  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index jobs_state_idx on cuentos.jobs (state, locked_until);
create index jobs_kind_created_idx on cuentos.jobs (kind, created_at desc);

create table cuentos.billing (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid references cuentos.orders(id),
  provider      text not null,              -- 'stripe' | 'etsy'
  provider_id   text not null unique,
  amount_cents  int  not null,
  currency      text not null default 'eur',
  vat_rate      numeric,
  status        text not null,
  raw           jsonb,
  created_at    timestamptz not null default now()
);

-- Demand signal for the printed book: measured, not built.
create table cuentos.print_interest (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid references cuentos.orders(id) on delete set null,
  email       text not null,
  created_at  timestamptz not null default now()
);

create table cuentos.waitlist (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  locale      text not null default 'es',
  reason      text not null default 'cap',  -- 'cap' (daily limit) | 'print'
  created_at  timestamptz not null default now()
);

-- Inputs refused by moderation: only a hash and the reason, never the text.
create table cuentos.blocked_inputs (
  id          uuid primary key default gen_random_uuid(),
  reason      text not null,
  input_hash  text not null,
  created_at  timestamptz not null default now()
);

create table cuentos.credits (
  email       text primary key,
  balance     int  not null default 0,
  updated_at  timestamptz not null default now()
);

-- Free gallery: the only world-readable table.
create table cuentos.coloring_pages (
  slug        text primary key,
  theme       text not null,
  locale      text not null,
  title       text not null,
  image_path  text not null,
  created_at  timestamptz not null default now()
);

-- updated_at maintenance
create or replace function cuentos.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;
create trigger orders_touch  before update on cuentos.orders  for each row execute function cuentos.touch_updated_at();
create trigger stories_touch before update on cuentos.stories for each row execute function cuentos.touch_updated_at();
create trigger jobs_touch    before update on cuentos.jobs    for each row execute function cuentos.touch_updated_at();

-- Row level security: on everywhere; no policies means service-role only.
alter table cuentos.orders         enable row level security;
alter table cuentos.stories        enable row level security;
alter table cuentos.jobs           enable row level security;
alter table cuentos.billing        enable row level security;
alter table cuentos.print_interest enable row level security;
alter table cuentos.waitlist       enable row level security;
alter table cuentos.blocked_inputs enable row level security;
alter table cuentos.credits        enable row level security;
alter table cuentos.coloring_pages enable row level security;

grant usage on schema cuentos to anon, authenticated, service_role;
grant all on all tables in schema cuentos to service_role;
grant select on cuentos.coloring_pages to anon, authenticated;
create policy coloring_public_read on cuentos.coloring_pages
  for select to anon, authenticated using (true);

-- Storage buckets (created through the Storage API, recorded here):
--   stories   private  — sheets, pages, colouring pages and PDFs, served by signed URL
--   coloring  public   — the free gallery
