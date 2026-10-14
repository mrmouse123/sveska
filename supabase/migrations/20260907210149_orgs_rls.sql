-- Faza 6, korak B: pristup ide preko organizacije, ne naloga.
-- Vlasnik vidi i menja sve u svojoj organizaciji; radnik vidi samo svoje poslove
-- i sme da im menja iskljucivo status (okidac to i proverava, ne samo UI).
--
-- NAPOMENA: funkcija `jobs_worker_status_only` definisana ovde je kasnije
-- zamenjena migracijom 20260907210345_jobs_worker_status_only_fix.sql.

do $$
declare t text;
begin
  foreach t in array array['jobs','workers','teams','customers','mixed_teams','mixed_team_members'] loop
    execute format('drop policy if exists "owner select" on public.%I', t);
    execute format('drop policy if exists "owner insert" on public.%I', t);
    execute format('drop policy if exists "owner update" on public.%I', t);
    execute format('drop policy if exists "owner delete" on public.%I', t);
    execute format('drop policy if exists "org select" on public.%I', t);
    execute format('drop policy if exists "org insert" on public.%I', t);
    execute format('drop policy if exists "org update" on public.%I', t);
    execute format('drop policy if exists "org delete" on public.%I', t);
  end loop;
end $$;

-- Referentni podaci: cela organizacija ih cita, samo vlasnik menja.
do $$
declare t text;
begin
  foreach t in array array['workers','teams','customers','mixed_teams','mixed_team_members'] loop
    execute format('create policy "org select" on public.%I for select using (org_id = public.my_org_id())', t);
    execute format('create policy "org insert" on public.%I for insert with check (org_id = public.my_org_id() and public.my_org_role() = ''owner'')', t);
    execute format('create policy "org update" on public.%I for update using (org_id = public.my_org_id() and public.my_org_role() = ''owner'') with check (org_id = public.my_org_id() and public.my_org_role() = ''owner'')', t);
    execute format('create policy "org delete" on public.%I for delete using (org_id = public.my_org_id() and public.my_org_role() = ''owner'')', t);
  end loop;
end $$;

-- Poslovi: radnik vidi i dira samo ono sto je njemu dodeljeno.
create policy "org select" on public.jobs for select
  using (
    org_id = public.my_org_id()
    and (public.my_org_role() = 'owner' or assignee_id = public.my_worker_id())
  );

create policy "org insert" on public.jobs for insert
  with check (org_id = public.my_org_id() and public.my_org_role() = 'owner');

create policy "org update" on public.jobs for update
  using (
    org_id = public.my_org_id()
    and (public.my_org_role() = 'owner' or assignee_id = public.my_worker_id())
  )
  with check (
    org_id = public.my_org_id()
    and (public.my_org_role() = 'owner' or assignee_id = public.my_worker_id())
  );

create policy "org delete" on public.jobs for delete
  using (org_id = public.my_org_id() and public.my_org_role() = 'owner');

-- RLS ne ume da ogranici pojedinacnu kolonu, pa to radi okidac.
create or replace function public.jobs_worker_status_only()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.my_org_role() = 'worker'
     and (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
    raise exception 'Radnik sme da menja samo status posla';
  end if;
  return new;
end;
$$;

drop trigger if exists jobs_worker_status_only on public.jobs;
create trigger jobs_worker_status_only
  before update on public.jobs
  for each row execute function public.jobs_worker_status_only();
