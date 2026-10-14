-- Faza 12, grupa D. Četiri nalaza iz pregleda, svaki u svom bloku.

-- S3: `jobs.status` je bio slobodan tekst. Radnik je smeo da upiše šta god —
-- okidač ga namerno izuzima iz poređenja — a ta vrednost ide u kontekst koji
-- aplikacija šalje Claude-u. Lista odgovara `STATUSES` iz src/.../Common.tsx.
alter table public.jobs drop constraint if exists jobs_status_check;
alter table public.jobs add constraint jobs_status_check check (
  status in ('ZAKAZANO','DODELJENO','U TOKU','ZAVRŠENO','OTKAZANO','ČEKA NAPLATU')
);

-- S4: svaka polisa filtrira po `org_id`, a indeksa na njemu nije bilo nigde.
-- Polisa na `customers` uz to gleda `jobs` po `assignee_id` i `customer_id`.
create index if not exists jobs_org_assignee_idx  on public.jobs (org_id, assignee_id);
create index if not exists jobs_org_customer_idx  on public.jobs (org_id, customer_id);
create index if not exists customers_org_idx      on public.customers (org_id);
create index if not exists workers_org_idx        on public.workers (org_id);
create index if not exists teams_org_idx          on public.teams (org_id);
create index if not exists mixed_teams_org_idx    on public.mixed_teams (org_id);
create index if not exists mixed_team_members_org_idx on public.mixed_team_members (org_id);

-- S2: radnik se nije mogao ukloniti iz organizacije. `org_members` ima samo
-- SELECT polisu, pa ni vlasnik to nije mogao iz aplikacije — otkaz nije
-- prekidao pristup. Brisanje reda iz `workers` ne pomaže jer `worker_id`
-- nema FK. Namerno RPC, a ne DELETE polisa: uži je i proverava ko zove.
create or replace function public.remove_member(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare org uuid := public.my_org_id();
begin
  if org is null or public.my_org_role() <> 'owner' then
    raise exception 'Samo vlasnik može da ukloni člana';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Vlasnik ne može da ukloni sebe';
  end if;
  delete from public.org_members where org_id = org and user_id = p_user_id;
end;
$$;

revoke all on function public.remove_member(uuid) from public, anon;
grant execute on function public.remove_member(uuid) to authenticated;

-- S1: tier je bio samo UI katanac — nijedna polisa nije čitala `profiles`.
-- Ne može se tražiti `scope <= tier` na poslovima, jer demo seed svakom nalogu
-- upisuje i `tim` i `zadruga` poslove, namerno, kao prodajni demo (provereno:
-- solo nalozi u bazi imaju scope=tim i scope=zadruga, 2 tima i 1 mixed tim).
-- Zato se zatvara ono što zaista nosi naplatu: pozivanje radnika traži bar
-- `tim`. Šire zatvaranje traži da seed postane svestan tiera — to je proizvodna
-- odluka, ne tehnička, i nije doneta.
create or replace function public.my_tier_rank()
returns int language sql stable security definer set search_path = '' as $$
  select case (select role from public.profiles where user_id = auth.uid())
           when 'zadruga' then 2 when 'tim' then 1 else 0 end
$$;

grant execute on function public.my_tier_rank() to authenticated;

create or replace function public.create_invite(p_worker_id text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  org  uuid := public.my_org_id();
  code text;
begin
  if org is null or public.my_org_role() <> 'owner' then
    raise exception 'Samo vlasnik može da pravi pozivnice';
  end if;
  if public.my_tier_rank() < 1 then
    raise exception 'Pozivanje radnika traži TIM ili ZADRUGA pretplatu';
  end if;
  code := upper(substring(replace(gen_random_uuid()::text, '-', '') for 8));
  insert into public.org_invites (code, org_id, worker_id) values (code, org, p_worker_id);
  return code;
end;
$$;
