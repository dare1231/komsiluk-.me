-- Komšiluk.me — objava oglasa BEZ registracije (gosti)
-- Pokreni jednom: Supabase Dashboard -> SQL Editor -> New query -> zalijepi -> Run.
-- Skripta je bezbjedna za ponovno pokretanje i samo DODAJE pravila (ne briše postojeća).

-- 1) Gosti smiju da DODAJU oglase (ne i da mijenjaju/brišu tuđe)
alter table public.oglasi enable row level security;
drop policy if exists "gosti_insert_oglasi" on public.oglasi;
create policy "gosti_insert_oglasi" on public.oglasi
  for insert to anon, authenticated
  with check (
    char_length(coalesce(naziv,'')) between 1 and 120
    and (user_id is null or user_id = auth.uid())
  );

-- svi vide odobrene oglase (ako već postoji slična politika, ništa se ne kvari)
drop policy if exists "svi_citaju_oglase" on public.oglasi;
create policy "svi_citaju_oglase" on public.oglasi
  for select to anon, authenticated using (true);

-- 2) Gosti smiju da pišu u Zajednicu i da šalju poruke u čet
alter table public.zajednica_objave enable row level security;
drop policy if exists "gosti_insert_zajednica" on public.zajednica_objave;
create policy "gosti_insert_zajednica" on public.zajednica_objave
  for insert to anon, authenticated with check (true);
drop policy if exists "svi_citaju_zajednicu" on public.zajednica_objave;
create policy "svi_citaju_zajednicu" on public.zajednica_objave
  for select to anon, authenticated using (true);

alter table public.poruke enable row level security;
drop policy if exists "gosti_insert_poruke" on public.poruke;
create policy "gosti_insert_poruke" on public.poruke
  for insert to anon, authenticated with check (true);
drop policy if exists "svi_citaju_poruke" on public.poruke;
create policy "svi_citaju_poruke" on public.poruke
  for select to anon, authenticated using (true);

-- 3) Gosti smiju da otpreme sliku u bucket 'oglasi-slike'
insert into storage.buckets (id, name, public)
values ('oglasi-slike', 'oglasi-slike', true)
on conflict (id) do update set public = true;

drop policy if exists "gosti_upload_slike" on storage.objects;
create policy "gosti_upload_slike" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'oglasi-slike');
drop policy if exists "svi_citaju_slike" on storage.objects;
create policy "svi_citaju_slike" on storage.objects
  for select to anon, authenticated using (bucket_id = 'oglasi-slike');

-- 4) ZAŠTITA OD SPAMA: najviše 5 oglasa dnevno po gostu (uređaju) i 60 gostinjskih oglasa na sat ukupno
create or replace function public.ogranici_goste_oglasi()
returns trigger language plpgsql security definer set search_path = public as $$
declare gid text; n int;
begin
  if new.user_id is null and coalesce(new.izvorni_link,'') like 'guest:%' then
    gid := split_part(new.izvorni_link, ':', 2);
    select count(*) into n from public.oglasi
      where izvorni_link like 'guest:' || gid || ':%' and created_at > now() - interval '24 hours';
    if n >= 5 then
      raise exception 'Dostigao/la si dnevni limit od 5 oglasa. Pokušaj sjutra.';
    end if;
    select count(*) into n from public.oglasi
      where user_id is null and izvorni_link like 'guest:%' and created_at > now() - interval '1 hour';
    if n >= 60 then
      raise exception 'Trenutno je mnogo objava. Pokušaj za koji minut.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_ogranici_goste_oglasi on public.oglasi;
create trigger trg_ogranici_goste_oglasi
  before insert on public.oglasi
  for each row execute function public.ogranici_goste_oglasi();
