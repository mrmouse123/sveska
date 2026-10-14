-- SVESKA — puna šema, izvučena iz kataloga žive baze 2026-10-14.
--
-- ŠTA JE OVO: snimak trenutnog stanja, ekvivalent onome što daje
-- `supabase db pull`. NIJE migracija i NE sme da se stavi u
-- `supabase/migrations/` — tamošnje migracije bi iste objekte pravile po
-- drugi put.
--
-- ZAŠTO POSTOJI: `sveska_init_schema` (verzija 20260826191413) je primenjena u
-- bazi ali nema fajl u repou, pa repo sam za sebe nije mogao da podigne bazu.
-- Ovaj fajl tu rupu zatvara dok se ne uradi pravi `supabase db pull`.
--
-- KAKO SE KORISTI na praznoj bazi:
--   psql "<connection-string>" -f supabase/schema/current.sql
-- pa zatim označiti sve postojeće migracije kao primenjene, da ih
-- `supabase db push` ne pokuša ponovo.
--
-- NIJE OVDE: `auth` šema (Supabase je pravi sam), podaci, Storage, Realtime,
-- i podešavanja projekta (Site URL, Redirect URLs, tajne edge funkcija).
--
-- Potpunost provereno brojanjem objekata prema katalogu:
--   10 tabela, 77 kolona, 37 ograničenja, 19 indeksa (11 iz ograničenja + 8),
--   28 polisa, 12 funkcija, 6 okidača u `public` + 1 na `auth.users`,
--   RLS uključen na svih 10 tabela.

-- =====================================================================
-- 1. Tabele
-- =====================================================================

create table if not exists public.customers (
  user_id uuid default auth.uid() not null,
  id text not null,
  name text not null,
  phone text default ''::text not null,
  email text default ''::text not null,
  address text default ''::text not null,
  notes text default ''::text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  org_id uuid
);

create table if not exists public.jobs (
  user_id uuid default auth.uid() not null,
  id text not null,
  scope text not null,
  customer_id text not null,
  description text default ''::text not null,
  date text not null,
  "time" text not null,
  location text default ''::text not null,
  price numeric default 0 not null,
  status text not null,
  paid boolean default false not null,
  assignee_type text default 'none'::text not null,
  assignee_id text,
  notes text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  org_id uuid
);

create table if not exists public.mixed_team_members (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  mixed_team_id text not null,
  worker_id text not null,
  responsibility text default ''::text not null,
  created_at timestamp with time zone default now() not null,
  org_id uuid
);

create table if not exists public.mixed_teams (
  user_id uuid default auth.uid() not null,
  id text not null,
  name text not null,
  project text default ''::text not null,
  created_at text not null,
  created_at_ts timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  org_id uuid
);

create table if not exists public.org_invites (
  code text not null,
  org_id uuid not null,
  worker_id text not null,
  created_at timestamp with time zone default now() not null,
  used_at timestamp with time zone,
  used_by uuid
);

create table if not exists public.org_members (
  org_id uuid not null,
  user_id uuid not null,
  role text not null,
  worker_id text,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.orgs (
  id uuid default gen_random_uuid() not null,
  owner_id uuid not null,
  name text default 'Moja organizacija'::text not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.profiles (
  user_id uuid not null,
  role text default 'solo'::text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.teams (
  user_id uuid default auth.uid() not null,
  id text not null,
  name text not null,
  member_ids text[] default '{}'::text[] not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  org_id uuid
);

create table if not exists public.workers (
  user_id uuid default auth.uid() not null,
  id text not null,
  name text not null,
  role text default ''::text not null,
  trade text default ''::text not null,
  team_id text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  org_id uuid
);

-- =====================================================================
-- 2. Ograničenja
--    Primarni ključevi su složeni, (user_id, id), i strani ključevi idu kroz
--    user_id. To znači da red može da ubaci samo onaj čiji user_id već stoji
--    na vezanim redovima — praktično samo vlasnik. Zapisano u pregledu kao
--    nalog D0.1: šema je ključevana po korisniku a logika po organizaciji.
-- =====================================================================

alter table public.customers add constraint customers_pkey PRIMARY KEY (user_id, id);
alter table public.jobs add constraint jobs_pkey PRIMARY KEY (user_id, id);
alter table public.mixed_team_members add constraint mixed_team_members_pkey PRIMARY KEY (id);
alter table public.mixed_teams add constraint mixed_teams_pkey PRIMARY KEY (user_id, id);
alter table public.org_invites add constraint org_invites_pkey PRIMARY KEY (code);
alter table public.org_members add constraint org_members_pkey PRIMARY KEY (org_id, user_id);
alter table public.orgs add constraint orgs_pkey PRIMARY KEY (id);
alter table public.profiles add constraint profiles_pkey PRIMARY KEY (user_id);
alter table public.teams add constraint teams_pkey PRIMARY KEY (user_id, id);
alter table public.workers add constraint workers_pkey PRIMARY KEY (user_id, id);

-- Korisnik može biti u tačno jednoj organizaciji, ikada.
alter table public.org_members add constraint org_members_user_id_key UNIQUE (user_id);

alter table public.jobs add constraint jobs_scope_check CHECK ((scope = ANY (ARRAY['solo'::text, 'tim'::text, 'zadruga'::text])));
alter table public.jobs add constraint jobs_status_check CHECK ((status = ANY (ARRAY['ZAKAZANO'::text, 'DODELJENO'::text, 'U TOKU'::text, 'ZAVRŠENO'::text, 'OTKAZANO'::text, 'ČEKA NAPLATU'::text])));
alter table public.org_members add constraint org_members_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'worker'::text])));
alter table public.profiles add constraint profiles_role_check CHECK ((role = ANY (ARRAY['solo'::text, 'tim'::text, 'zadruga'::text])));

alter table public.customers add constraint customers_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
alter table public.customers add constraint customers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.jobs add constraint jobs_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
alter table public.jobs add constraint jobs_user_id_customer_id_fkey FOREIGN KEY (user_id, customer_id) REFERENCES public.customers(user_id, id) ON DELETE CASCADE;
alter table public.jobs add constraint jobs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.mixed_team_members add constraint mixed_team_members_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
alter table public.mixed_team_members add constraint mixed_team_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.mixed_team_members add constraint mixed_team_members_user_id_mixed_team_id_fkey FOREIGN KEY (user_id, mixed_team_id) REFERENCES public.mixed_teams(user_id, id) ON DELETE CASCADE;
alter table public.mixed_team_members add constraint mixed_team_members_user_id_worker_id_fkey FOREIGN KEY (user_id, worker_id) REFERENCES public.workers(user_id, id) ON DELETE CASCADE;
alter table public.mixed_teams add constraint mixed_teams_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
alter table public.mixed_teams add constraint mixed_teams_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.org_invites add constraint org_invites_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
alter table public.org_invites add constraint org_invites_used_by_fkey FOREIGN KEY (used_by) REFERENCES auth.users(id);
alter table public.org_members add constraint org_members_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
alter table public.org_members add constraint org_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.orgs add constraint orgs_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.profiles add constraint profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.teams add constraint teams_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
alter table public.teams add constraint teams_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.workers add constraint workers_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
alter table public.workers add constraint workers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.workers add constraint workers_user_id_team_id_fkey FOREIGN KEY (user_id, team_id) REFERENCES public.teams(user_id, id) ON DELETE SET NULL;

-- =====================================================================
-- 3. Indeksi (pored onih koje prave ograničenja)
-- =====================================================================

CREATE INDEX IF NOT EXISTS customers_org_idx ON public.customers USING btree (org_id);
CREATE INDEX IF NOT EXISTS jobs_org_assignee_idx ON public.jobs USING btree (org_id, assignee_id);
CREATE INDEX IF NOT EXISTS jobs_org_customer_idx ON public.jobs USING btree (org_id, customer_id);
CREATE INDEX IF NOT EXISTS jobs_user_date_idx ON public.jobs USING btree (user_id, date);
CREATE INDEX IF NOT EXISTS mixed_team_members_org_idx ON public.mixed_team_members USING btree (org_id);
CREATE INDEX IF NOT EXISTS mixed_teams_org_idx ON public.mixed_teams USING btree (org_id);
CREATE INDEX IF NOT EXISTS teams_org_idx ON public.teams USING btree (org_id);
CREATE INDEX IF NOT EXISTS workers_org_idx ON public.workers USING btree (org_id);

-- =====================================================================
-- 4. Funkcije
-- =====================================================================

CREATE OR REPLACE FUNCTION public.my_org_id()
 RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  select org_id from public.org_members where user_id = auth.uid()
$function$;

CREATE OR REPLACE FUNCTION public.my_org_role()
 RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  select role from public.org_members where user_id = auth.uid()
$function$;

CREATE OR REPLACE FUNCTION public.my_worker_id()
 RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  select worker_id from public.org_members where user_id = auth.uid()
$function$;

-- Polisa na org_members pušta sve članove organizacije, pa direktan select ne
-- može da posluži za „moje članstvo" — vraćao bi više redova.
CREATE OR REPLACE FUNCTION public.my_membership()
 RETURNS TABLE(org_id uuid, role text, worker_id text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  select m.org_id, m.role, m.worker_id
  from public.org_members m
  where m.user_id = auth.uid()
$function$;

CREATE OR REPLACE FUNCTION public.my_tier_rank()
 RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  select case (select role from public.profiles where user_id = auth.uid())
           when 'zadruga' then 2 when 'tim' then 1 else 0 end
$function$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger LANGUAGE plpgsql
AS $function$
begin new.updated_at = now(); return new; end $function$;

-- RLS ne ume da ograniči pojedinačnu kolonu, pa to radi okidač.
-- `updated_at` se izuzima jer se osvežava sam, pa bi inače blokirao i
-- dozvoljenu promenu statusa.
CREATE OR REPLACE FUNCTION public.jobs_worker_status_only()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
begin
  if public.my_org_role() = 'worker'
     and (to_jsonb(new) - 'status' - 'updated_at')
         is distinct from (to_jsonb(old) - 'status' - 'updated_at') then
    raise exception 'Radnik sme da menja samo status posla';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
begin
  insert into public.profiles (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.ensure_org()
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.create_invite(p_worker_id text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.redeem_invite(p_code text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.remove_member(p_user_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
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
$function$;

revoke all on function public.remove_member(uuid) from public, anon;
grant execute on function public.remove_member(uuid) to authenticated;

-- =====================================================================
-- 5. Okidači
--    Ime je bitno: Postgres pokreće BEFORE-row okidače po abecedi, pa
--    `jobs_updated_at` mora pre `jobs_worker_status_only`.
-- =====================================================================

CREATE TRIGGER customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER jobs_updated_at BEFORE UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER jobs_worker_status_only BEFORE UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.jobs_worker_status_only();
CREATE TRIGGER mixed_teams_updated_at BEFORE UPDATE ON public.mixed_teams FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER teams_updated_at BEFORE UPDATE ON public.teams FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER workers_updated_at BEFORE UPDATE ON public.workers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Ovaj NIJE u `public` šemi i lako se previdi pri ručnom prepisivanju.
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================================
-- 6. RLS
-- =====================================================================

alter table public.customers enable row level security;
alter table public.jobs enable row level security;
alter table public.mixed_team_members enable row level security;
alter table public.mixed_teams enable row level security;
alter table public.org_invites enable row level security;
alter table public.org_members enable row level security;
alter table public.orgs enable row level security;
alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.workers enable row level security;

-- =====================================================================
-- 7. Polise
--    Sve ciljaju rolu `public`. Nije iskoristivo jer `my_org_id()` za anon
--    vraća NULL, pa svaki predikat otpadne — ali jedna buduća polisa bez
--    null-safe predikata bila bi čitljiva anonimno.
-- =====================================================================

-- Klijenti: vlasnik sve; radnik samo one sa poslova koji su NJEMU dodeljeni.
create policy "org select" on public.customers for select to public
  using (((org_id = my_org_id()) AND ((my_org_role() = 'owner'::text) OR (EXISTS ( SELECT 1
   FROM public.jobs j
  WHERE ((j.org_id = my_org_id()) AND (j.user_id = customers.user_id) AND (j.customer_id = customers.id) AND (j.assignee_id = my_worker_id())))))));
create policy "org insert" on public.customers for insert to public
  with check (((org_id = my_org_id()) AND (my_org_role() = 'owner'::text)));
create policy "org update" on public.customers for update to public
  using (((org_id = my_org_id()) AND (my_org_role() = 'owner'::text)))
  with check (((org_id = my_org_id()) AND (my_org_role() = 'owner'::text)));
create policy "org delete" on public.customers for delete to public
  using (((org_id = my_org_id()) AND (my_org_role() = 'owner'::text)));

-- Poslovi: radnik vidi i dira samo ono što je njemu dodeljeno.
create policy "org select" on public.jobs for select to public
  using (((org_id = my_org_id()) AND ((my_org_role() = 'owner'::text) OR (assignee_id = my_worker_id()))));
create policy "org insert" on public.jobs for insert to public
  with check (((org_id = my_org_id()) AND (my_org_role() = 'owner'::text)));
create policy "org update" on public.jobs for update to public
  using (((org_id = my_org_id()) AND ((my_org_role() = 'owner'::text) OR (assignee_id = my_worker_id()))))
  with check (((org_id = my_org_id()) AND ((my_org_role() = 'owner'::text) OR (assignee_id = my_worker_id()))));
create policy "org delete" on public.jobs for delete to public
  using (((org_id = my_org_id()) AND (my_org_role() = 'owner'::text)));

-- Radnici, timovi i mixed timovi: samo vlasnik. Radnikova strana ih ne čita.
create policy "org select" on public.workers for select to public
  using (((org_id = my_org_id()) AND (my_org_role() = 'owner'::text)));
create policy "org insert" on public.workers for insert to public
  with check (((org_id = my_org_id()) AND (my_org_role() = 'owner'::text)));
create policy "org update" on public.workers for update to public
  using (((org_id = my_org_id()) AND (my_org_role() = 'owner'::text)))
  with check (((org_id = my_org_id()) AND (my_org_role() = 'owner'::text)));
create policy "org delete" on public.workers for delete to public
  using (((org_id = my_org_id()) AND (my_org_role() = 'owner'::text)));

create policy "org select" on public.teams for select to public
  using (((org_id = my_org_id()) AND (my_org_role() = 'owner'::text)));
create policy "org insert" on public.teams for insert to public
  with check (((org_id = my_org_id()) AND (my_org_role() = 'owner'::text)));
create policy "org update" on public.teams for update to public
  using (((org_id = my_org_id()) AND (my_org_role() = 'owner'::text)))
  with check (((org_id = my_org_id()) AND (my_org_role() = 'owner'::text)));
create policy "org delete" on public.teams for delete to public
  using (((org_id = my_org_id()) AND (my_org_role() = 'owner'::text)));

create policy "org select" on public.mixed_teams for select to public
  using (((org_id = my_org_id()) AND (my_org_role() = 'owner'::text)));
create policy "org insert" on public.mixed_teams for insert to public
  with check (((org_id = my_org_id()) AND (my_org_role() = 'owner'::text)));
create policy "org update" on public.mixed_teams for update to public
  using (((org_id = my_org_id()) AND (my_org_role() = 'owner'::text)))
  with check (((org_id = my_org_id()) AND (my_org_role() = 'owner'::text)));
create policy "org delete" on public.mixed_teams for delete to public
  using (((org_id = my_org_id()) AND (my_org_role() = 'owner'::text)));

create policy "org select" on public.mixed_team_members for select to public
  using (((org_id = my_org_id()) AND (my_org_role() = 'owner'::text)));
create policy "org insert" on public.mixed_team_members for insert to public
  with check (((org_id = my_org_id()) AND (my_org_role() = 'owner'::text)));
create policy "org update" on public.mixed_team_members for update to public
  using (((org_id = my_org_id()) AND (my_org_role() = 'owner'::text)))
  with check (((org_id = my_org_id()) AND (my_org_role() = 'owner'::text)));
create policy "org delete" on public.mixed_team_members for delete to public
  using (((org_id = my_org_id()) AND (my_org_role() = 'owner'::text)));

create policy "owner invites" on public.org_invites for select to public
  using (((org_id = my_org_id()) AND (my_org_role() = 'owner'::text)));
create policy "own membership select" on public.org_members for select to public
  using ((org_id = my_org_id()));
create policy "own org select" on public.orgs for select to public
  using ((id = my_org_id()));
-- `profiles` nema INSERT/UPDATE polisu: korisnik ne može da sebi digne tier.
create policy "own profile select" on public.profiles for select to public
  using ((user_id = auth.uid()));
