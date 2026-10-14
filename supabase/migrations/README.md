# Stanje migracija (provereno 2026-10-03)

Baza `nieypuvbxvhapfvjbhoc` ima 7 primenjenih migracija. Fajlovi u ovom folderu
su ih dugo pratili samo delimicno — cetiri su postojale samo u bazi.

| # | Verzija u bazi | Naziv | Fajl |
|---|---|---|---|
| 1 | 20260826191413 | sveska_init_schema | **NEDOSTAJE** |
| 2 | 20260907183730 | auth_per_user | `20260907000002_auth_per_user.sql` (drugi prefiks) |
| 3 | 20260907204507 | profiles_roles | `20260908000003_profiles_roles.sql` (drugi prefiks) |
| 4 | 20260907205740 | orgs_schema | `20260908000004_orgs_schema.sql` (drugi prefiks) |
| 5 | 20260907210149 | orgs_rls | `20260907210149_orgs_rls.sql` |
| 6 | 20260907210345 | jobs_worker_status_only_fix | `20260907210345_jobs_worker_status_only_fix.sql` |
| 7 | 20260907211311 | my_membership_rpc | `20260907211311_my_membership_rpc.sql` |

## Dva otvorena problema

1. **`sveska_init_schema` nije rekonstruisan.** Ta migracija pravi 6 tabela sa
   podacima. Nije ovde jer bi svaka moja rekonstrukcija bila pogadjanje, ne
   original. Baza podignuta samo iz ovog foldera nece imati tabele.
   Izvuci je iz Supabase dashboard-a (Database -> Migrations) ili sa
   `supabase db pull`.

2. **Prefiksi fajlova 2-4 se ne poklapaju sa verzijama u bazi.** Supabase CLI
   uparuje po prefiksu, pa bi `supabase db push` pokusao da ih primeni ponovo.
   Preimenovati u tacne verzije pre nego sto se CLI uopste koristi.
