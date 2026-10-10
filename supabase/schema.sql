-- SchoolFix JSON document store. Run once in Supabase Dashboard > SQL Editor.
create table if not exists public.schoolfix_store (
  key text primary key check (key in ('reports', 'school_applications')),
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.schoolfix_store enable row level security;

-- Browser roles must never read/write reports directly. The server uses the
-- Supabase service_role secret from Render environment variables.
revoke all on table public.schoolfix_store from anon, authenticated;
grant select, insert, update on table public.schoolfix_store to service_role;
