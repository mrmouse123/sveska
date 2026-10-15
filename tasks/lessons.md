# Lekcije — SVESKA

Pravila izvedena iz stvarnih grešaka u radu na ovom projektu. Čitati na početku
svake sesije. Format: „Kad X, radi Y, jer Z."

## Verifikacija

**1. Kad pišem probu za parser, imena u testu moraju da se sudaraju.**
Proba sastavljena od ugrađenih demo komanda je prošla, a „kod Ane Marković" je
upisivalo „Marko Petrović". Nijedno demo ime se ne sudara, pa proba meri ništa.
Test podaci moraju biti protivnički: prefiksi, ime jednog = prezime drugog.

**2. Kad se pojavi rezultat u UI-u, to nije dokaz da je put kroz AI radio.**
`aiService` tiho pada na lokalni interpreter. Kartica izgleda isto u oba slučaja.
Dokaz je `source === "ai"` u rezultatu, ili log edge funkcije — ne izgled ekrana.

**3. Kad tvrdim da nešto radi, moram imati izvršenu komandu, ne pročitan kod.**
Bug sa „kod Ane Marković" našao je samo pravi E2E, ne čitanje i ne proba.

## Tvrdnje o stanju sistema

**4. Kad zaključujem da nešto nije moguće, prvo proverim mašinu, ne konfiguraciju.**
Rekao sam da push na GitHub nije rešen jer je konektor neautorizovan. Pogrešno:
git na ovoj mašini ima `credential.helper=manager` i već pušuje drugi repo.
Nedostupan konektor ne znači nedostupna sposobnost.

**5. Kad ne mogu da potvrdim da je alat aktivan, kažem to — i proverim ponovo posle.**
Rekao sam da ne mogu da potvrdim da je advisor aktivan; pojavio se u istoj sesiji
odmah posle upisa u settings.json. Tvrdnja je bila tačna u trenutku, ali nisam
proverio ponovo kad se stanje promenilo.

## Baza i migracije

**6. Kad primenim migraciju kroz MCP, fajl ide u repo u istom koraku.**
Četiri primenjene migracije nisu imale fajl u repou. Baza podignuta iz repoa ne
bi radila — bez `my_membership()` svaki korisnik zaglavi na spineru.

**7. Kad pišem okidač koji poredi redove, isključujem kolone koje se same menjaju.**
`jobs.updated_at` se osvežava na svaku izmenu, pa je poređenje celog reda uvek
bilo različito i blokiralo radniku i dozvoljenu promenu statusa.

**8. Kad rekonstruišem migraciju koju nemam, ne pogađam.**
`sveska_init_schema` pravi sve tabele. Pogrešna rekonstrukcija je gora od
nedostajuće — ide `supabase db pull`, ne pamćenje.

## Dokumentacija

**9. Kad promenim deo dokumenta, pročitam ceo dokument pre commita.**
Očistio sam lozinke iz DEPLOY.md i ostavio fajl u kom svi koraci govore o
Vercel-u, a postavljeno je GitHub Pages. Isto odstupanje koje lovim u bazi.

**10. Kad repo postaje javan, tajne tražim grep-om, ne pamćenjem.**
Lozinke su bile i u README.md, ne samo u DEPLOY.md. Našao ih je grep.

## Alati i granice

**11. Kad heredoc u Bash-u sadrži regex, backslash-evi se pojedu — koristim Write.**
`\b` je postao literalni backspace karakter u zapisanom fajlu, pa je kasniji
patch promašio sidro. Bolje: dizajnirati rešenje bez regex escape-ova.

**12. Kad klasifikator blokira radnju, ne tražim obilazni put.**
Blokiran `UPDATE` na `auth.users` i `get_advisors` — stanem i objasnim.

**13. Mikrofon se ne dira bez izričite dozvole, svaki put.**
Klik na mikrofon je poslao zvuk iz prostorije Google-ovom servisu za
prepoznavanje govora. Dozvola za jedan test nije dozvola za sledeći.

**14. Lozinke ne kucam u polja. Naloge pravi Jovan.**
Važi i za test naloge na localhost-u — u ovoj sesiji je tako postavljeno.

**17. Kad prijava vrati „Failed to execute 'fetch' on 'Window': Invalid value",
kriv je OBLIK ključa, ne kredencijali.**
U GitHub tajnu `VITE_SUPABASE_ANON_KEY` ušao je ceo blok — URL, prelom reda i
`VITE_SUPABASE_ANON_KEY=` prefiks. Ta vrednost ide u `apikey` HTTP zaglavlje,
a zaglavlje ne sme da sadrži prelom reda, pa `fetch` pukne pre slanja.
Proveravati objavljeni bundle, ne lokalni `.env`: `VITE_*` se ugrađuje u
trenutku build-a, pa lokalno može biti ispravno a objavljeno pokvareno.

**18. Kad diktiram vrednost koju neko lepi, dam komandu koja je stavlja u
clipboard — ne opis šta da iseče.**
Rekao sam „red 2, kopiraj sve posle znaka =", a on je nalepio iz moje poruke
gde su stajala oba reda. Komanda sa `Set-Clipboard` + provera dužine i broja
redova ne ostavlja prostor za grešku.

**19. Kad popravku branim listom reči, prvo pitam je li klasa otvorena.**
`NOT_A_NAME` je pokušavala da nabroji opise („servis", „hitno", „popodne") —
to je otvorena klasa i lista je morala da padne. Pala je na 13 od 24 obične
rečenice: „kod Petrovića servis bojlera" je pravilo klijenta „Petrovica Servis".
Oslovljavanja (gospodin, doktor, majstor, komšija) JESU zatvorena klasa i tamo
je lista ispravan alat. Pre liste: da li mogu da nabrojim sve članove?

**20. Kad moja proba prolazi a popravka je rizična, proba je premala.**
`names2.ts` je bio 23/23 zelen dok je kod u produkciji lomio svaku drugu
rečenicu. U njemu nije bilo nijedne rečenice sa običnom rečju posle „kod
<Prezime>", ni sa interpunkcijom iza sata. Protivnički pregled nad MOJIM
izmenama našao je ono što moja proba po konstrukciji nije mogla.

**21. Kad zamenim `upsert` sa `update`, gubim samopopravljanje.**
`upsert` je usput stvarao red koji nedostaje; `update` koji ne pogodi nijedan
red vraća 200 i prazan niz BEZ greške, pa korisnik zauvek vidi uspeh.
Ko pređe na `update`, mora da traži `.select()` i proveri da li je išta vraćeno.

**22. Kad popravljam dvosmislenost u jeziku, proverim šta ista promena radi
češćem slučaju.**
Uklanjanje `vowelStem` bi razdvojilo Radu i Rade, ali bi „kod Ane" prestalo da
nalazi Anu. Dvosmislenost se zapisuje kao ograničenje, ne krpi na slepo.

**23. Kad pišem probu, ulaz mora biti kakav stvarno stiže.**
Pola prvog prolaza `lang.ts` je palo zato što sam ulaz kucao ASCII-jem
(„Nikolica"), pa je i izlaz bio bez dijakritike — proba je merila moj ulaz, ne
kod. Srpski ulaz piši srpski.

**24. Pre nego što zatvorim pravilo u bazi, proverim krši li ga već sama
aplikacija.**
Tier se nije mogao zatvoriti kao „scope <= tier", jer demo seed svakom nalogu
namerno upisuje `tim` i `zadruga` podatke. Upit nad živim podacima je to
pokazao za dvadeset sekundi; da sam krenuo od polise, polomio bih seed.

**25. Kad agentski nalaz označim kao „neproveren" i preskočim ga, zapišem ga
tako da se vidi — jer se vraća kao prijava sa terena.**
Protivnički pregled je našao da se pri ponovnom pokretanju prepoznavanja stari
prepoznavač ne gasi, pa oba dopisuju u isti tekst. Prijavio sam to kao agentski
nalaz koji nisam sam proverio, i nisam popravio. Vratilo se kao „na telefonu
duplira sve što se kaže", sa dva uređaja.

**26. Pre nego što zaključim da je nešto retko, pitam na kom uređaju.**
Grana sa `r.start()` koji baci je na desktopu retka, a na Androidu PRAVILO —
`continuous` tamo jedva radi, pa `onend` okida posle svake rečenice. Procena
„retko" je bila tačna samo za uređaj na kom sam gledao.

## Dizajn

**15. Kad popravka parkira grešku bez ičega što je prazni, popravka je pogrešna.**
Prvi fix za sync je čuvao neuspelo stanje bez pokretača koji bi ga ponovo poslao.
Jednostavnije i ispravnije: isprazni red pa baci prvu grešku.

**16. Kad je izvor istine podeljen između baze i lokalne kopije, baza pobeđuje.**
Vlasnik i radnik dele organizaciju; lokalna kopija je vraćala radnikove izmene
na staro. Hidracija ide iz baze, lokalno ostaje samo offline keš.
