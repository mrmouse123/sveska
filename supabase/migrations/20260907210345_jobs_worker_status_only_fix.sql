-- `updated_at` se osvezava sam na svaku izmenu, pa ne sme da ulazi u poredjenje:
-- inace bi radniku bila blokirana i dozvoljena promena statusa.
create or replace function public.jobs_worker_status_only()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.my_org_role() = 'worker'
     and (to_jsonb(new) - 'status' - 'updated_at')
         is distinct from (to_jsonb(old) - 'status' - 'updated_at') then
    raise exception 'Radnik sme da menja samo status posla';
  end if;
  return new;
end;
$$;
