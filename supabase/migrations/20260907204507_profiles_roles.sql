-- SVESKA — role po nalogu (nivo pretplate: solo < tim < zadruga)
--
-- Rola se čuva u bazi i korisnik je NE MOŽE menjati: postoji samo SELECT polisa
-- za sopstveni red. Upis ide preko service role (Supabase SQL editor / dashboard).

create table if not exists public.profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  role       text not null default 'solo' check (role in ('solo', 'tim', 'zadruga')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Korisnik vidi samo svoju rolu. Namerno nema insert/update/delete polise:
-- role dodeljuje vlasnik projekta, ne korisnik.
drop policy if exists "own profile select" on public.profiles;
create policy "own profile select"
  on public.profiles for select
  using (user_id = auth.uid());

-- Svaki nov nalog dobija najniži nivo.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Postojeći nalozi (napravljeni pre ove migracije).
insert into public.profiles (user_id)
select id from auth.users
on conflict (user_id) do nothing;
