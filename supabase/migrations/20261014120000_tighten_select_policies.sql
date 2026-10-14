-- Nalaz B iz pregleda Faze 10: `org select` polisa je puštala CELU organizaciju
-- svakom članu, dok insert/update/delete traže vlasnika. Dokazano prijavom kao
-- pravi radnik: video je 3 od 29 poslova (ispravno) ali 5 od 5 klijenata sa
-- telefonima i adresama, ceo spisak radnika i sve timove.
--
-- Radnikova strana (workerService.ts) čita SAMO `jobs` i `customers`, pa:
--  - customers: vlasnik sve; radnik samo klijente sa poslova koji su NJEMU dodeljeni
--  - workers/teams/mixed_teams/mixed_team_members: samo vlasnik (radnik ih ne čita)

drop policy if exists "org select" on public.customers;

-- Spoj mora da ide preko OBA dela ključa: jobs.customer_id pokazuje na
-- customers(user_id, id), pa poređenje samo po `id` ne bi bilo tačno.
create policy "org select" on public.customers for select
  using (
    org_id = public.my_org_id()
    and (
      public.my_org_role() = 'owner'
      or exists (
        select 1
        from public.jobs j
        where j.org_id = public.my_org_id()
          and j.user_id = customers.user_id
          and j.customer_id = customers.id
          and j.assignee_id = public.my_worker_id()
      )
    )
  );

do $$
declare t text;
begin
  foreach t in array array['workers','teams','mixed_teams','mixed_team_members'] loop
    execute format('drop policy if exists "org select" on public.%I', t);
    execute format(
      'create policy "org select" on public.%I for select using (org_id = public.my_org_id() and public.my_org_role() = ''owner'')',
      t);
  end loop;
end $$;
