-- SVESKA — Faza 6, korak A: organizacije i članstva (bez menjanja RLS-a nad podacima)
--
-- Posle ovog koraka aplikacija radi isto kao pre: stare polise `user_id = auth.uid()`
-- su netaknute, a `org_id` je samo popunjen. RLS se prebacuje tek u koraku B,
-- kad klijent počne da šalje `org_id`.
--
-- Pretpostavka: jedan nalog pripada tačno jednoj organizaciji (unique na user_id).

create table if not exists public.orgs (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users (id) on delete cascade,
  name       text not null default 'Moja organizacija',
  created_at timestamptz not null default now()
);

create table if not exists public.org_members (
  org_id     uuid not null references public.orgs (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null check (role in ('owner', 'worker')),
  -- Za radnika: koji red iz `workers` je taj čovek. Vlasnik nema.
  worker_id  text,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id),
  unique (user_id)
);

create table if not exists public.org_invites (
  code       text primary key,
  org_id     uuid not null references public.orgs (id) on delete cascade,
  worker_id  text not null,
  created_at timestamptz not null default now(),
  used_at    timestamptz,
  used_by    uuid references auth.users (id)
);

-- Podaci dobijaju pripadnost organizaciji. `user_id` ostaje i dalje se upisuje,
-- pa je korak reverzibilan: dovoljno je vratiti stare polise.
alter table public.jobs               add column if not exists org_id uuid references public.orgs (id) on delete cascade;
alter table public.workers            add column if not exists org_id uuid references public.orgs (id) on delete cascade;
alter table public.teams              add column if not exists org_id uuid references public.orgs (id) on delete cascade;
alter table public.customers          add column if not exists org_id uuid references public.orgs (id) on delete cascade;
alter table public.mixed_teams        add column if not exists org_id uuid references public.orgs (id) on delete cascade;
alter table public.mixed_team_members add column if not exists org_id uuid references public.orgs (id) on delete cascade;

/* ---------- pomoćne funkcije ----------
   SECURITY DEFINER jer polise nad `org_members` inače same sebe pozivaju u krug. */

create or replace function public.my_org_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select org_id from public.org_members where user_id = auth.uid()
$$;

create or replace function public.my_org_role()
returns text language sql stable security definer set search_path = '' as $$
  select role from public.org_members where user_id = auth.uid()
$$;

create or replace function public.my_worker_id()
returns text language sql stable security definer set search_path = '' as $$
  select worker_id from public.org_members where user_id = auth.uid()
$$;

/* ---------- backfill: svaki postojeći nalog postaje vlasnik svoje organizacije ---------- */

insert into public.orgs (owner_id)
select u.id from auth.users u
where not exists (select 1 from public.orgs o where o.owner_id = u.id);

insert into public.org_members (org_id, user_id, role)
select o.id, o.owner_id, 'owner' from public.orgs o
on conflict (user_id) do nothing;

update public.jobs               t set org_id = o.id from public.orgs o where o.owner_id = t.user_id and t.org_id is null;
update public.workers            t set org_id = o.id from public.orgs o where o.owner_id = t.user_id and t.org_id is null;
update public.teams              t set org_id = o.id from public.orgs o where o.owner_id = t.user_id and t.org_id is null;
update public.customers          t set org_id = o.id from public.orgs o where o.owner_id = t.user_id and t.org_id is null;
update public.mixed_teams        t set org_id = o.id from public.orgs o where o.owner_id = t.user_id and t.org_id is null;
update public.mixed_team_members t set org_id = o.id from public.orgs o where o.owner_id = t.user_id and t.org_id is null;

/* ---------- RLS nad novim tabelama ---------- */

alter table public.orgs         enable row level security;
alter table public.org_members  enable row level security;
alter table public.org_invites  enable row level security;

drop policy if exists "own org select" on public.orgs;
create policy "own org select" on public.orgs for select
  using (id = public.my_org_id());

drop policy if exists "own membership select" on public.org_members;
create policy "own membership select" on public.org_members for select
  using (org_id = public.my_org_id());

-- Pozivnice vidi i pravi samo vlasnik; iskorišćavanje ide kroz RPC.
drop policy if exists "owner invites" on public.org_invites;
create policy "owner invites" on public.org_invites for select
  using (org_id = public.my_org_id() and public.my_org_role() = 'owner');

/* ---------- RPC: organizacija, pozivnice ---------- */

-- Vlasnički nalog bez organizacije dobija svoju. Radnik koji je već član dobija svoju natrag.
create or replace function public.ensure_org()
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  existing uuid;
  new_org  uuid;
begin
  if auth.uid() is null then raise exception 'Nije prijavljen'; end if;
  select org_id into existing from public.org_members where user_id = auth.uid();
  if existing is not null then return existing; end if;

  insert into public.orgs (owner_id) values (auth.uid()) returning id into new_org;
  insert into public.org_members (org_id, user_id, role) values (new_org, auth.uid(), 'owner');
  return new_org;
end;
$$;

-- Vlasnik pravi kod za konkretnog radnika iz svoje organizacije.
create or replace function public.create_invite(p_worker_id text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  org  uuid := public.my_org_id();
  code text;
begin
  if org is null or public.my_org_role() <> 'owner' then
    raise exception 'Samo vlasnik može da pravi pozivnice';
  end if;
  code := upper(substring(replace(gen_random_uuid()::text, '-', '') for 8));
  insert into public.org_invites (code, org_id, worker_id) values (code, org, p_worker_id);
  return code;
end;
$$;

-- Radnik unosi kod: postaje član organizacije vezan za svog radnika.
create or replace function public.redeem_invite(p_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  inv public.org_invites%rowtype;
begin
  if auth.uid() is null then raise exception 'Nije prijavljen'; end if;
  select * into inv from public.org_invites where code = upper(trim(p_code));
  if inv.code is null then raise exception 'Kod ne postoji'; end if;
  if inv.used_at is not null then raise exception 'Kod je već iskorišćen'; end if;
  if exists (select 1 from public.org_members where user_id = auth.uid()) then
    raise exception 'Nalog je već u organizaciji';
  end if;

  insert into public.org_members (org_id, user_id, role, worker_id)
  values (inv.org_id, auth.uid(), 'worker', inv.worker_id);

  update public.org_invites set used_at = now(), used_by = auth.uid() where code = inv.code;
  return inv.org_id;
end;
$$;

grant execute on function public.ensure_org()            to authenticated;
grant execute on function public.create_invite(text)     to authenticated;
grant execute on function public.redeem_invite(text)     to authenticated;
grant execute on function public.my_org_id()             to authenticated;
grant execute on function public.my_org_role()           to authenticated;
grant execute on function public.my_worker_id()          to authenticated;
