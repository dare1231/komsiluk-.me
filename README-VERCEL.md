# Komšiluk — Vercel postavljanje

## 1. Vercel Environment Variables

U Vercel projektu dodaj za **Production, Preview i Development**:

- `SUPABASE_URL` = URL Supabase projekta
- `SUPABASE_SERVICE_ROLE_KEY` = Supabase **service_role** ključ (nikad ga ne stavljati u `index.html`)

`SUPABASE_SERVICE_ROLE_KEY` koriste samo `/api/auto-confirm-user` i `/api/analytics` server rute.

## 2. Supabase analitika

U Supabase Dashboard → **SQL Editor** pokreni sadržaj fajla `supabase-analytics.sql`.

## 3. Deploy

Root direktorijum projekta je direktorijum u kome su `index.html`, `vercel.json` i `api/`.
Vercel može da ga objavi kao statički sajt sa serverless funkcijama bez build komande.

Posle deploy-a proveri:

- registracija novog korisnika automatski prijavljuje korisnika;
- `+` → Postavi oglas → oglas se vidi odmah;
- Profil → Pregled aktivnosti sajta prikazuje posete i broj različitih posetilaca.

Ako postojeće Supabase RLS politike blokiraju upis u `oglasi`, `profiles` ili `poruke`, treba ih proveriti u Supabase Table Editor-u; ova aplikacija sada prikazuje stvarnu grešku umesto da tiho izgubi objavu.

## Dnevni uvoz oglasa

`/api/daily-import` se pokreće svakog dana u 05:00 UTC. Izvor mora vratiti JSON oblika `{ "ads": [...] }` sa tačno 5 oglasa iz Podgorice, Bara, Nikšića, Budve i Kotora. Svaki oglas mora imati naziv, cijenu, telefon, grad i `created_at` stariji najviše 3 dana.

Prije unosa endpoint briše 3 najstarija oglasa iz baze, a zatim dodaje 5 novih. Ako fotografija ima logotip ili vodeni žig druge oglasne aplikacije, URL se ne preuzima; koristi se lokalna neutralna fotografija.

Potrebne Vercel varijable: `DAILY_IMPORT_TOKEN`, `DAILY_ADS_SOURCE_URL`, opcionalno `DAILY_ADS_SOURCE_TOKEN`, `NEUTRAL_IMAGE_URL`, postojeće `SUPABASE_URL` i `SUPABASE_SERVICE_ROLE_KEY`. Jednom pokrenuti `daily-import.sql` u Supabase SQL Editor-u.

## Objave na Facebooku i Instagramu

Nakon dnevnog uvoza pravi se jedna objava od 4 proizvoda: 1 Temu proizvod i 3 najnovija oglasa iz aplikacije. Kolaž prikazuje fotografiju, naziv i lokaciju. Opis objave je `Najnovije na aplikaciji · link u bio`. Objava se poziva odmah nakon uspješnog dnevnog uvoza; termin u 05:15 UTC ostaje rezervni pokušaj ako Meta privremeno ne odgovori. Pokrenuti `temu-products.sql` i podesiti Meta varijable iz dokumentacije.

Za Vercel Cron obavezno podesiti tajnu `CRON_SECRET` u production okruženju; Vercel je šalje kao `Authorization: Bearer ...`. Podesiti i `AUTO_SOCIAL_PUBLISH=true`, `PUBLIC_SITE_URL` i Meta varijable. `META_PUBLISH_TOKEN` je zaseban, opcionalni token za ručno pokretanje endpointa; ne koristiti Meta access token kao Cron tajnu.

## Dnevni Temu panel

Admin panel sada ima tri polja za dnevne Temu linkove. Nakon prijave, klik na **Sačuvaj paket** preuzima osnovni naziv i sliku proizvoda i čuva tri aktivna proizvoda u `temu_products`; klik na **Pregled objave** provjerava tri najnovija odobrena lokalna oglasa i prvi Temu proizvod. Ručna Meta objava koristi prijavljenu Supabase sesiju; automatski Vercel Cron koristi `CRON_SECRET`.
