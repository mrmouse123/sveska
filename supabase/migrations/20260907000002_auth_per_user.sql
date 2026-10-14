-- Phase 2: per-user data. Dev-only tables are dropped and recreated with
-- user_id + composite PK (user_id, id), because demo IDs ("j-s1", "c-marko")
-- are identical for every user.

drop table if exists public.mixed_team_members;
drop table if exists public.jobs;
drop table if exists public.mixed_teams;
drop table if exists public.workers;
drop table if exists public.teams;
drop table if exists public.customers;

create table public.teams (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  name text not null,
  member_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.workers (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  name text not null,
  role text not null default '',
  trade text not null default '',
  team_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, team_id) references public.teams(user_id, id) on delete set null
);

create table public.customers (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  name text not null,
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.mixed_teams (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  name text not null,
  project text not null default '',
  created_at text not null,
  created_at_ts timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.mixed_team_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  mixed_team_id text not null,
  worker_id text not null,
  responsibility text not null default '',
  created_at timestamptz not null default now(),
  foreign key (user_id, mixed_team_id) references public.mixed_teams(user_id, id) on delete cascade,
  foreign key (user_id, worker_id) references public.workers(user_id, id) on delete cascade
);

create table public.jobs (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  scope text not null check (scope in ('solo','tim','zadruga')),
  customer_id text not null,
  description text not null default '',
  date text not null,
  time text not null,
  location text not null default '',
  price numeric not null default 0,
  status text not null,
  paid boolean not null default false,
  assignee_type text not null default 'none',
  assignee_id text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, customer_id) references public.customers(user_id, id) on delete cascade
);

create index jobs_user_date_idx on public.jobs (user_id, date);

-- updated_at trigger
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

do $$ declare t text;
begin
  foreach t in array array['teams','workers','customers','mixed_teams','jobs'] loop
    execute format('create trigger %I_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- RLS: each user sees and edits only their own rows.
do $$ declare t text;
begin
  foreach t in array array['teams','workers','customers','mixed_teams','mixed_team_members','jobs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "owner select" on public.%I for select to authenticated using (user_id = auth.uid())', t);
    execute format('create policy "owner insert" on public.%I for insert to authenticated with check (user_id = auth.uid())', t);
    execute format('create policy "owner update" on public.%I for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('create policy "owner delete" on public.%I for delete to authenticated using (user_id = auth.uid())', t);
  end loop;
end $$;
