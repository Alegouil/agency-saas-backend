create extension if not exists pgcrypto;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_state (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  config jsonb not null default '{}'::jsonb,
  messages jsonb not null default '[]'::jsonb,
  kpis jsonb not null default '{}'::jsonb,
  last_id integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.generated_images (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id text not null,
  message_id integer,
  storage_bucket text not null,
  storage_path text not null unique,
  public_url text not null,
  mime_type text not null default 'image/png',
  prompt text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists workspaces_set_updated_at on public.workspaces;
create trigger workspaces_set_updated_at
before update on public.workspaces
for each row
execute function public.set_updated_at();

drop trigger if exists workspace_state_set_updated_at on public.workspace_state;
create trigger workspace_state_set_updated_at
before update on public.workspace_state
for each row
execute function public.set_updated_at();

drop trigger if exists generated_images_set_updated_at on public.generated_images;
create trigger generated_images_set_updated_at
before update on public.generated_images
for each row
execute function public.set_updated_at();

alter table public.workspaces enable row level security;
alter table public.workspace_state enable row level security;
alter table public.generated_images enable row level security;

create policy "service role full access workspaces"
on public.workspaces
for all
to service_role
using (true)
with check (true);

create policy "service role full access workspace_state"
on public.workspace_state
for all
to service_role
using (true)
with check (true);

create policy "service role full access generated_images"
on public.generated_images
for all
to service_role
using (true)
with check (true);

insert into storage.buckets (id, name, public)
values ('generated-assets', 'generated-assets', true)
on conflict (id) do nothing;

insert into public.workspaces (slug, name)
values ('default', 'Workspace par defaut')
on conflict (slug) do nothing;

insert into public.workspace_state (workspace_id)
select id
from public.workspaces
where slug = 'default'
on conflict (workspace_id) do nothing;
