-- Polisa na org_members namerno pusta sve clanove organizacije (trebace za spisak tima),
-- pa direktan select ne moze da posluzi za "moje clanstvo" — vracao bi vise redova.
-- Bez ove funkcije `fetchMembership` vraca null i radnik zavrsava na pocetnoj strani.
create or replace function public.my_membership()
returns table (org_id uuid, role text, worker_id text)
language sql stable security definer set search_path = '' as $$
  select m.org_id, m.role, m.worker_id
  from public.org_members m
  where m.user_id = auth.uid()
$$;

grant execute on function public.my_membership() to authenticated;
