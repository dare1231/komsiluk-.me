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
