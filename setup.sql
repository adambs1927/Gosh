-- =====================================================================
-- GOSH USH — SETUP DATABASE SUPABASE (project BARU / kosong)
-- Cara: Supabase Dashboard > SQL Editor > New query > tempel semua > Run
-- Aman dijalankan ulang (idempotent).
-- =====================================================================

-- ---------- TABEL ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  whatsapp text,
  created_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin')),
  unique (user_id, role)
);

create table if not exists public.app_settings (
  id int primary key check (id = 1),
  admin_whatsapp text not null default '6285876026804',
  qris_path text,
  qris_active boolean not null default false
);

create table if not exists public.fare_settings (
  id int primary key check (id = 1),
  one_way_fare numeric not null default 5000 check (one_way_fare > 0),
  round_trip_fare numeric not null default 9000 check (round_trip_fare > 0)
);

create sequence if not exists public.booking_seq start 1001;

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  user_id uuid not null references public.profiles(id) on delete cascade,
  pickup_location text not null,
  destination text not null,
  pickup_at timestamptz not null,
  trip_type text not null check (trip_type in ('one_way','round_trip')),
  notes text,
  fare numeric not null,
  status text not null default 'pending'
    check (status in ('pending','confirmed','on_the_way','completed','cancelled','rejected')),
  request_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, request_id)
);
create index if not exists bookings_user_idx on public.bookings(user_id, created_at desc);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  amount numeric not null,
  status text not null default 'unpaid'
    check (status in ('unpaid','pending_verification','verified','rejected')),
  proof_path text,
  rejection_reason text,
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text check (comment is null or length(comment) <= 1000),
  created_at timestamptz not null default now()
);

-- Catatan audit: setiap tindakan admin pada pembayaran/status tercatat di sini
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor uuid,
  action text not null,
  booking_id uuid,
  detail jsonb,
  created_at timestamptz not null default now()
);

insert into public.app_settings (id) values (1) on conflict (id) do nothing;
insert into public.fare_settings (id) values (1) on conflict (id) do nothing;

-- ---------- FUNGSI BANTU ----------
create or replace function public.has_role(_user uuid, _role text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user and role = _role)
$$;

-- profil otomatis dibuat saat daftar
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, whatsapp)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), new.raw_user_meta_data->>'whatsapp')
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.booking_json(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(b) || jsonb_build_object(
    'payments', coalesce((select jsonb_agg(to_jsonb(p)) from public.payments p where p.booking_id = b.id), '[]'::jsonb))
  from public.bookings b where b.id = p_id
$$;

-- ---------- RPC: MAHASISWA ----------
create or replace function public.create_booking(
  p_pickup text, p_destination text, p_pickup_at timestamptz,
  p_trip_type text, p_notes text, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_fare numeric;
  v_existing uuid;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Silakan login terlebih dahulu'; end if;
  if p_request_id is null then raise exception 'Permintaan tidak valid'; end if;

  -- cegah pesanan ganda (klik dua kali)
  select id into v_existing from public.bookings where user_id = v_uid and request_id = p_request_id;
  if v_existing is not null then return public.booking_json(v_existing); end if;

  if length(trim(coalesce(p_pickup,''))) < 3 or length(p_pickup) > 200 then
    raise exception 'Titik jemput tidak valid'; end if;
  if length(trim(coalesce(p_destination,''))) < 3 or length(p_destination) > 200 then
    raise exception 'Tujuan tidak valid'; end if;
  if p_notes is not null and length(p_notes) > 500 then raise exception 'Catatan terlalu panjang'; end if;
  if p_trip_type not in ('one_way','round_trip') then raise exception 'Jenis perjalanan tidak valid'; end if;
  if p_pickup_at < now() + interval '15 minutes' then
    raise exception 'Waktu jemput minimal 15 menit dari sekarang'; end if;
  if p_pickup_at > now() + interval '60 days' then
    raise exception 'Waktu jemput maksimal 60 hari ke depan'; end if;

  -- batasi pesanan yang belum dibayar (anti spam)
  if (select count(*) from public.bookings b join public.payments p on p.booking_id = b.id
      where b.user_id = v_uid and b.status = 'pending' and p.status = 'unpaid') >= 5 then
    raise exception 'Terlalu banyak pesanan belum dibayar. Selesaikan atau batalkan dulu.';
  end if;

  -- tarif SELALU dihitung server, bukan dari browser
  select case when p_trip_type = 'round_trip' then round_trip_fare else one_way_fare end
    into v_fare from public.fare_settings where id = 1;

  insert into public.bookings (code, user_id, pickup_location, destination, pickup_at, trip_type, notes, fare, request_id)
  values ('GOSH-' || lpad(nextval('public.booking_seq')::text, 4, '0'), v_uid, trim(p_pickup), trim(p_destination),
          p_pickup_at, p_trip_type, nullif(trim(coalesce(p_notes,'')), ''), v_fare, p_request_id)
  returning id into v_id;

  insert into public.payments (booking_id, amount) values (v_id, v_fare);
  return public.booking_json(v_id);
end $$;

create or replace function public.submit_payment_proof(p_booking_id uuid, p_path text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_pay public.payments; v_book public.bookings;
begin
  if v_uid is null then raise exception 'Silakan login terlebih dahulu'; end if;
  select * into v_book from public.bookings where id = p_booking_id and user_id = v_uid;
  if not found then raise exception 'Pesanan tidak ditemukan'; end if;
  if v_book.status <> 'pending' then raise exception 'Pesanan ini tidak bisa dibayar lagi'; end if;
  if p_path is null or split_part(p_path, '/', 1) <> v_uid::text then
    raise exception 'Berkas bukti tidak valid'; end if;
  select * into v_pay from public.payments where booking_id = p_booking_id for update;
  if v_pay.status not in ('unpaid','rejected') then
    raise exception 'Bukti sudah dikirim atau pembayaran sudah diverifikasi'; end if;
  update public.payments set status = 'pending_verification', proof_path = p_path, rejection_reason = null
   where id = v_pay.id;
end $$;

create or replace function public.cancel_my_booking(p_booking_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_book public.bookings; v_pay public.payments;
begin
  select * into v_book from public.bookings where id = p_booking_id and user_id = v_uid;
  if not found then raise exception 'Pesanan tidak ditemukan'; end if;
  select * into v_pay from public.payments where booking_id = p_booking_id;
  if v_book.status <> 'pending' or v_pay.status <> 'unpaid' then
    raise exception 'Pesanan ini sudah tidak bisa dibatalkan'; end if;
  update public.bookings set status = 'cancelled', updated_at = now() where id = p_booking_id;
end $$;

-- ---------- RPC: ADMIN (semua tercatat di audit_log) ----------
create or replace function public.admin_verify_payment(p_booking_id uuid, p_approve boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_pay public.payments;
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Hanya admin'; end if;
  select * into v_pay from public.payments where booking_id = p_booking_id for update;
  if not found then raise exception 'Pembayaran tidak ditemukan'; end if;
  if v_pay.status <> 'pending_verification' then
    raise exception 'Pembayaran tidak sedang menunggu verifikasi'; end if;

  if p_approve then
    update public.payments set status = 'verified', verified_by = auth.uid(), verified_at = now(), rejection_reason = null
     where id = v_pay.id;
    update public.bookings set status = 'confirmed', updated_at = now()
     where id = p_booking_id and status = 'pending';
  else
    if p_reason is null or length(trim(p_reason)) < 3 then
      raise exception 'Alasan penolakan minimal 3 huruf'; end if;
    update public.payments set status = 'rejected', rejection_reason = trim(p_reason),
           verified_by = auth.uid(), verified_at = now()
     where id = v_pay.id;
  end if;

  insert into public.audit_log (actor, action, booking_id, detail)
  values (auth.uid(), case when p_approve then 'payment_verified' else 'payment_rejected' end, p_booking_id,
          jsonb_build_object('amount', v_pay.amount, 'reason', p_reason));
end $$;

create or replace function public.admin_update_booking_status(p_booking_id uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_old text;
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Hanya admin'; end if;
  if p_status not in ('pending','confirmed','on_the_way','completed','cancelled','rejected') then
    raise exception 'Status tidak valid'; end if;
  select status into v_old from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'Pesanan tidak ditemukan'; end if;
  update public.bookings set status = p_status, updated_at = now() where id = p_booking_id;
  insert into public.audit_log (actor, action, booking_id, detail)
  values (auth.uid(), 'status_changed', p_booking_id,
          jsonb_build_object('from', v_old, 'to', p_status, 'note', p_note));
end $$;

-- hanya user login yang boleh memanggil RPC
revoke execute on all functions in schema public from public, anon;
grant execute on function public.create_booking(text,text,timestamptz,text,text,uuid) to authenticated;
grant execute on function public.submit_payment_proof(uuid,text) to authenticated;
grant execute on function public.cancel_my_booking(uuid) to authenticated;
grant execute on function public.admin_verify_payment(uuid,boolean,text) to authenticated;
grant execute on function public.admin_update_booking_status(uuid,text,text) to authenticated;
grant execute on function public.has_role(uuid,text) to authenticated;

-- ---------- ROW LEVEL SECURITY ----------
alter table public.profiles       enable row level security;
alter table public.user_roles     enable row level security;
alter table public.app_settings   enable row level security;
alter table public.fare_settings  enable row level security;
alter table public.bookings       enable row level security;
alter table public.payments       enable row level security;
alter table public.reviews        enable row level security;
alter table public.audit_log      enable row level security;

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select to authenticated
  using (id = auth.uid() or public.has_role(auth.uid(), 'admin'));
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "roles_select" on public.user_roles;
create policy "roles_select" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

drop policy if exists "app_settings_read" on public.app_settings;
create policy "app_settings_read" on public.app_settings for select to anon, authenticated using (true);
drop policy if exists "app_settings_admin_update" on public.app_settings;
create policy "app_settings_admin_update" on public.app_settings for update to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "fare_settings_read" on public.fare_settings;
create policy "fare_settings_read" on public.fare_settings for select to anon, authenticated using (true);
drop policy if exists "fare_settings_admin_update" on public.fare_settings;
create policy "fare_settings_admin_update" on public.fare_settings for update to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "bookings_select" on public.bookings;
create policy "bookings_select" on public.bookings for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

drop policy if exists "payments_select" on public.payments;
create policy "payments_select" on public.payments for select to authenticated
  using (public.has_role(auth.uid(), 'admin')
         or exists (select 1 from public.bookings b where b.id = booking_id and b.user_id = auth.uid()));

drop policy if exists "reviews_select" on public.reviews;
create policy "reviews_select" on public.reviews for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
drop policy if exists "reviews_insert" on public.reviews;
create policy "reviews_insert" on public.reviews for insert to authenticated
  with check (user_id = auth.uid() and exists (
    select 1 from public.bookings b where b.id = booking_id and b.user_id = auth.uid() and b.status = 'completed'));
drop policy if exists "reviews_update" on public.reviews;
create policy "reviews_update" on public.reviews for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "audit_select" on public.audit_log;
create policy "audit_select" on public.audit_log for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- tabel sensitif TIDAK boleh ditulis langsung dari browser (hanya lewat RPC di atas)
revoke insert, update, delete on public.bookings, public.payments, public.audit_log, public.user_roles
  from anon, authenticated;
revoke insert, delete on public.profiles from anon, authenticated;
revoke insert, update, delete on public.app_settings, public.fare_settings from anon;
revoke all on all tables in schema public from anon;
grant select on public.app_settings, public.fare_settings to anon;

-- ---------- STORAGE (bucket privat) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('qris', 'qris', false, 5242880, array['image/jpeg','image/png','image/webp']),
  ('payment-proofs', 'payment-proofs', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "qris_read" on storage.objects;
create policy "qris_read" on storage.objects for select to authenticated using (bucket_id = 'qris');
drop policy if exists "qris_admin_write" on storage.objects;
create policy "qris_admin_write" on storage.objects for insert to authenticated
  with check (bucket_id = 'qris' and public.has_role(auth.uid(), 'admin'));
drop policy if exists "qris_admin_delete" on storage.objects;
create policy "qris_admin_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'qris' and public.has_role(auth.uid(), 'admin'));

drop policy if exists "proofs_insert_own" on storage.objects;
create policy "proofs_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'payment-proofs' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "proofs_select" on storage.objects;
create policy "proofs_select" on storage.objects for select to authenticated
  using (bucket_id = 'payment-proofs'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.has_role(auth.uid(), 'admin')));

-- =====================================================================
-- Setelah setup.sql, jalankan migrasi
-- migrations/20261027_admin_control_panel.sql untuk memasang Control Panel.
--
-- Setelah akun admin utama terdaftar dan emailnya terverifikasi, migrasi
-- menetapkan role berdasarkan UUID akun di auth.users:
--   adambs1927@gmail.com
--
-- Jangan memberi role admin dari frontend atau metadata yang dapat diedit user.
-- =====================================================================
