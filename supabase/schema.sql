-- 1) Villalar tablosu
create table if not exists public.villas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  city text,
  district_neighborhood text,
  description text,
  bedroom_count integer,
  bathroom_count integer,
  gross_area integer,
  seasonal_rent_try numeric(12,2),
  deed_status text,
  owner_name text,
  owner_email text,
  owner_phone text,
  phone_status text,
  call_date date,
  call_duration_minutes integer,
  call_summary text,
  owner_concerns text,
  follow_up_actions text,
  status text default 'Beklemede',
  created_at timestamptz not null default now()
);

-- 2) Villa fotoğrafları tablosu
create table if not exists public.villa_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  villa_id uuid not null references public.villas(id) on delete cascade,
  path text not null,
  public_url text not null,
  created_at timestamptz not null default now()
);

create index if not exists villas_user_id_idx on public.villas(user_id);
create index if not exists villa_photos_villa_id_idx on public.villa_photos(villa_id);

-- 3) RLS aktif et
alter table public.villas enable row level security;
alter table public.villa_photos enable row level security;

-- 4) Villalar policy
drop policy if exists "villas_select_own" on public.villas;
create policy "villas_select_own"
on public.villas
for select
using (auth.uid() = user_id);

drop policy if exists "villas_insert_own" on public.villas;
create policy "villas_insert_own"
on public.villas
for insert
with check (auth.uid() = user_id);

drop policy if exists "villas_update_own" on public.villas;
create policy "villas_update_own"
on public.villas
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "villas_delete_own" on public.villas;
create policy "villas_delete_own"
on public.villas
for delete
using (auth.uid() = user_id);

-- 5) Villa foto policy
drop policy if exists "villa_photos_select_own" on public.villa_photos;
create policy "villa_photos_select_own"
on public.villa_photos
for select
using (auth.uid() = user_id);

drop policy if exists "villa_photos_insert_own" on public.villa_photos;
create policy "villa_photos_insert_own"
on public.villa_photos
for insert
with check (auth.uid() = user_id);

drop policy if exists "villa_photos_delete_own" on public.villa_photos;
create policy "villa_photos_delete_own"
on public.villa_photos
for delete
using (auth.uid() = user_id);

-- 6) Storage bucket ve policy
insert into storage.buckets (id, name, public)
values ('villa-photos', 'villa-photos', true)
on conflict (id) do nothing;

drop policy if exists "villa_photos_storage_select" on storage.objects;
create policy "villa_photos_storage_select"
on storage.objects
for select
using (bucket_id = 'villa-photos');

drop policy if exists "villa_photos_storage_insert_own" on storage.objects;
create policy "villa_photos_storage_insert_own"
on storage.objects
for insert
with check (
  bucket_id = 'villa-photos'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "villa_photos_storage_delete_own" on storage.objects;
create policy "villa_photos_storage_delete_own"
on storage.objects
for delete
using (
  bucket_id = 'villa-photos'
  and auth.uid()::text = (storage.foldername(name))[1]
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7) Transactions tablosu — finansal gelir/gider takibi
-- ─────────────────────────────────────────────────────────────────────────────
-- Ödeme modeli (20 / 80 kuralı):
--   miktar            = toplam rezervasyon / işlem tutarı
--   komisyon_orani    = bizim kestiğimiz yüzde (varsayılan %20)
--   on_odeme_net      = rezervasyon anında bizim tahsil ettiğimiz tutar
--                       (miktar × komisyon_orani / 100)  — "Alınan Ön Ödeme"
--   kapida_odenecek   = misafir, villa girişinde ev sahibine nakit öder
--                       (miktar − on_odeme_net)           — "Ev Sahibi Payı"
--   durum             = BİZİM on_odeme_net'i tahsil durumumuz
--   kapida_odeme_dur  = ev sahibinin kapıdaki tahsil durumu
-- Gider satırlarında on_odeme_net / kapida_odenecek / kapida_odeme_dur NULL kalır.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.transactions (
  id                 uuid          primary key default gen_random_uuid(),
  user_id            uuid          not null references auth.users(id) on delete cascade,
  villa_id           uuid          references public.villas(id) on delete set null,
  rezervasyon_id     text,
  islem_tipi         text          not null check (islem_tipi in ('Gelir', 'Gider')),
  miktar             numeric(12,2) not null default 0,
  komisyon_orani     numeric(5,2)  default 20,
  on_odeme_net       numeric(12,2) generated always as
                       (case when islem_tipi = 'Gelir'
                             then round(miktar * komisyon_orani / 100, 2)
                             else null end) stored,
  kapida_odenecek    numeric(12,2) generated always as
                       (case when islem_tipi = 'Gelir'
                             then round(miktar * (1 - komisyon_orani / 100), 2)
                             else null end) stored,
  islem_tarihi       date          not null,
  aciklama           text,
  durum              text          not null default 'Beklemede'
                                   check (durum in ('Ödendi', 'Beklemede', 'İptal')),
  kapida_odeme_dur   text          default 'Beklemede'
                                   check (kapida_odeme_dur in ('Ödendi', 'Beklemede', 'İptal')),
  created_by         text,
  created_at         timestamptz   not null default now()
);

-- Mevcut tablo varsa eksik sütunları ekle (idempotent migration)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'transactions'
      and column_name  = 'komisyon_orani'
  ) then
    alter table public.transactions add column komisyon_orani numeric(5,2) default 20;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'transactions'
      and column_name  = 'kapida_odeme_dur'
  ) then
    alter table public.transactions
      add column kapida_odeme_dur text default 'Beklemede'
        check (kapida_odeme_dur in ('Ödendi', 'Beklemede', 'İptal'));
  end if;
end $$;

create index if not exists transactions_villa_id_idx     on public.transactions(villa_id);
create index if not exists transactions_user_id_idx      on public.transactions(user_id);
create index if not exists transactions_islem_tarihi_idx on public.transactions(islem_tarihi);

alter table public.transactions enable row level security;

drop policy if exists "transactions_select_own" on public.transactions;
create policy "transactions_select_own" on public.transactions
  for select using (auth.uid() = user_id);

drop policy if exists "transactions_insert_own" on public.transactions;
create policy "transactions_insert_own" on public.transactions
  for insert with check (auth.uid() = user_id);

drop policy if exists "transactions_update_own" on public.transactions;
create policy "transactions_update_own" on public.transactions
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "transactions_delete_own" on public.transactions;
create policy "transactions_delete_own" on public.transactions
  for delete using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8) Owner Payouts tablosu — villa sahibi hakediş kayıtları
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.owner_payouts (
  id                uuid          primary key default gen_random_uuid(),
  user_id           uuid          not null references auth.users(id) on delete cascade,
  villa_id          uuid          references public.villas(id) on delete set null,
  sahip_adi         text          not null,
  donem_baslangic   date          not null,
  donem_bitis       date          not null,
  brut_gelir        numeric(12,2) not null default 0,
  komisyon_orani    numeric(5,2)  not null default 20,   -- yüzde, ör: 20 = %20
  komisyon_tutari   numeric(12,2) not null default 0,    -- brut_gelir * oran / 100
  gider_toplami     numeric(12,2) not null default 0,
  net_hakedis       numeric(12,2) not null default 0,    -- brut - komisyon - gider
  durum             text          not null default 'Beklemede'
                                  check (durum in ('Ödendi', 'Beklemede')),
  odeme_tarihi      date,
  notlar            text,
  created_at        timestamptz   not null default now(),

  -- Hesaplama tutarlılığı kısıtı (opsiyonel iş kuralı)
  constraint net_hakedis_check
    check (net_hakedis = brut_gelir - komisyon_tutari - gider_toplami)
);

create index if not exists owner_payouts_villa_id_idx on public.owner_payouts(villa_id);
create index if not exists owner_payouts_user_id_idx  on public.owner_payouts(user_id);

alter table public.owner_payouts enable row level security;

drop policy if exists "owner_payouts_select_own" on public.owner_payouts;
create policy "owner_payouts_select_own" on public.owner_payouts
  for select using (auth.uid() = user_id);

drop policy if exists "owner_payouts_insert_own" on public.owner_payouts;
create policy "owner_payouts_insert_own" on public.owner_payouts
  for insert with check (auth.uid() = user_id);

drop policy if exists "owner_payouts_update_own" on public.owner_payouts;
create policy "owner_payouts_update_own" on public.owner_payouts
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "owner_payouts_delete_own" on public.owner_payouts;
create policy "owner_payouts_delete_own" on public.owner_payouts
  for delete using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 9) Storage bucket — activity fotoğrafları
-- ─────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('activity-photos', 'activity-photos', true)
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10) Profiles tablosu — kullanıcı profilleri ve rol yönetimi
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id         uuid        primary key references auth.users(id) on delete cascade,
  full_name  text,
  email      text,
  role       text        not null default 'staff'
                         check (role in ('admin', 'staff')),
  created_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles(role);

-- RLS
alter table public.profiles enable row level security;

-- Güvenli rol sorgulama fonksiyonu (sonsuz döngüden kaçınır)
create or replace function public.get_my_role()
returns text
language sql
security definer
stable
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- ── SELECT: Her kullanıcı sadece kendi profilini görebilir ───────────────────
-- İki politika OR mantığıyla çalışır:
--   • staff → sadece kendi satırı (auth.uid() = id)
--   • admin → tüm satırlar   (get_my_role() = 'admin')
drop policy if exists "profiles_select" on public.profiles;
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_select_admin" on public.profiles;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles_select_admin" on public.profiles
  for select using (public.get_my_role() = 'admin');

-- ── INSERT: Sadece trigger (security definer) ekleyebilir ───────────────────
-- Normal authenticated kullanıcıların doğrudan INSERT yapmasına izin verilmez.
-- Yeni kullanıcı profili handle_new_user() trigger'ı tarafından oluşturulur.
-- supabaseAdmin (service role) RLS'yi bypass ettiğinden doğrudan upsert yapabilir.
-- (Açık bir INSERT politikası olmadığında RLS varsayılan olarak reddeder.)

-- ── UPDATE: Kendi profilini güncelle / admin hepsini güncelleyebilir ─────────
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id)
  with check (
    -- Kullanıcının kendi role alanını değiştirmesini engelle
    role = (select role from public.profiles where id = auth.uid())
  );

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin" on public.profiles
  for update using (public.get_my_role() = 'admin');

-- Trigger: yeni kullanıcı kaydolduğunda otomatik profil oluştur
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'staff')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─────────────────────────────────────────────────────────────────────────────
-- 11) Audit Logs tablosu — işlem geçmişi
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.audit_logs (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        references auth.users(id) on delete set null,
  user_name   text,
  action      text        not null,
  table_name  text        not null,
  record_id   text,
  old_data    jsonb,
  new_data    jsonb,
  description text,
  created_at  timestamptz not null default now()
);

create index if not exists audit_logs_created_at_idx  on public.audit_logs(created_at desc);
create index if not exists audit_logs_user_id_idx     on public.audit_logs(user_id);
create index if not exists audit_logs_action_idx      on public.audit_logs(action);
create index if not exists audit_logs_table_name_idx  on public.audit_logs(table_name);

alter table public.audit_logs enable row level security;

-- Sadece admin okuyabilir
drop policy if exists "audit_logs_select_admin" on public.audit_logs;
create policy "audit_logs_select_admin" on public.audit_logs
  for select using (public.get_my_role() = 'admin');

-- Kimlik doğrulanmış kullanıcılar kayıt oluşturabilir
drop policy if exists "audit_logs_insert" on public.audit_logs;
create policy "audit_logs_insert" on public.audit_logs
  for insert with check (auth.role() = 'authenticated');

-- Audit logları değiştirilemez ve silinemez (UPDATE/DELETE politikası yok = deny)
-- RLS etkin olduğunda açık politika olmayan tüm işlemler varsayılan olarak reddedilir.
-- Bu davranış kasıtlıdır: audit log geçmişi hiç kimse tarafından değiştirilemez.

-- ─────────────────────────────────────────────────────────────────────────────
-- 13) Tasks tablosu — görev yönetimi (assigned_to + due_date ile)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.tasks (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  title       text        not null,
  status      text        not null default 'Yapılacak'
                          check (status in ('Yapılacak', 'Yapılıyor', 'Tamamlandı')),
  assigned_to uuid        references public.profiles(id) on delete set null,
  due_date    date,
  created_at  timestamptz not null default now()
);

create index if not exists tasks_user_id_idx     on public.tasks(user_id);
create index if not exists tasks_assigned_to_idx on public.tasks(assigned_to);
create index if not exists tasks_due_date_idx    on public.tasks(due_date);

alter table public.tasks enable row level security;

-- Admin tüm görevleri görebilir
drop policy if exists "tasks_select_admin" on public.tasks;
create policy "tasks_select_admin" on public.tasks
  for select using (public.get_my_role() = 'admin');

-- Staff: kendine atanan görevleri VE atanmamış (herkese açık) görevleri görebilir
drop policy if exists "tasks_select_staff" on public.tasks;
create policy "tasks_select_staff" on public.tasks
  for select using (
    assigned_to = auth.uid()
    OR assigned_to IS NULL
  );

-- Authenticated users görev oluşturabilir
drop policy if exists "tasks_insert" on public.tasks;
create policy "tasks_insert" on public.tasks
  for insert with check (auth.uid() = user_id);

-- Admin her görevi güncelleyebilir; staff kendi veya atanmamış görevleri güncelleyebilir
drop policy if exists "tasks_update" on public.tasks;
create policy "tasks_update" on public.tasks
  for update using (
    public.get_my_role() = 'admin'
    OR assigned_to = auth.uid()
    OR assigned_to IS NULL
  );

-- Sadece admin görev silebilir
drop policy if exists "tasks_delete_admin" on public.tasks;
create policy "tasks_delete_admin" on public.tasks
  for delete using (public.get_my_role() = 'admin');

-- ─────────────────────────────────────────────────────────────────────────────
-- 12) İlk Admin Kullanıcısı Kurulumu
--
-- Supabase Dashboard → Authentication → Settings bölümünde:
--   • "Confirm email" → KAPALI (e-posta onayı olmadan anında giriş)
--   • "Enable email provider" → AÇIK
--
-- İlk admin kullanıcıyı oluşturmak için aşağıdaki komutu
-- Supabase Dashboard → SQL Editor'da ÇALIŞTIRUN:
-- ─────────────────────────────────────────────────────────────────────────────

-- ADIM 1: Auth kullanıcısı oluştur (şifre: "admin")
-- Bu komutu Supabase SQL Editor'da çalıştırın.
-- Not: bcrypt hash değeri "admin" şifresine aittir.
/*
  INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    role,
    aud,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data
  ) VALUES (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000000',
    'admin@villa.com',
    crypt('admin', gen_salt('bf')),
    now(),
    'authenticated',
    'authenticated',
    now(),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Admin","role":"admin"}'
  );
*/

-- ADIM 2: Profil tablosuna admin rolü ekle
-- Yukarıdaki INSERT'ten sonra kullanıcı ID'sini alıp profiles tablosuna ekleyin:
/*
  INSERT INTO public.profiles (id, full_name, email, role)
  SELECT id, 'Admin', 'admin@villa.com', 'admin'
  FROM auth.users
  WHERE email = 'admin@villa.com'
  ON CONFLICT (id) DO UPDATE SET role = 'admin';
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- VEYA: Supabase Dashboard → Authentication → Users → "Add User" butonunu
-- kullanarak admin@villa.com / admin hesabı oluşturun, ardından:
--
--   UPDATE public.profiles SET role = 'admin' WHERE email = 'admin@villa.com';
--
-- komutunu SQL Editor'da çalıştırın.
-- ─────────────────────────────────────────────────────────────────────────────
