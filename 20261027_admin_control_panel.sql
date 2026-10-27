begin;

create table if not exists public.pickup_points (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  zone text not null check (length(trim(zone)) between 2 and 80),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists pickup_points_name_lower_uidx
  on public.pickup_points (lower(name));

create table if not exists public.zone_fares (
  id uuid primary key default gen_random_uuid(),
  origin_zone text not null check (length(trim(origin_zone)) between 2 and 80),
  destination_zone text not null check (length(trim(destination_zone)) between 2 and 80),
  one_way_fare numeric not null check (one_way_fare > 0),
  round_trip_fare numeric not null check (round_trip_fare > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (lower(trim(origin_zone)) <> lower(trim(destination_zone)))
);

create unique index if not exists zone_fares_route_lower_uidx
  on public.zone_fares (lower(trim(origin_zone)), lower(trim(destination_zone)));

create or replace function public.has_role(_user uuid, _role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and _user = auth.uid()
    and exists (
      select 1
      from public.user_roles
      where user_id = auth.uid()
        and role = _role
    );
$$;

revoke all on function public.has_role(uuid, text) from public, anon;
grant execute on function public.has_role(uuid, text) to authenticated;

alter table public.pickup_points enable row level security;
alter table public.zone_fares enable row level security;

drop policy if exists pickup_points_public_read on public.pickup_points;
create policy pickup_points_public_read on public.pickup_points
  for select to anon, authenticated
  using (is_active);

drop policy if exists pickup_points_admin_read on public.pickup_points;
create policy pickup_points_admin_read on public.pickup_points
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

drop policy if exists pickup_points_anon_security_select on public.pickup_points;
create policy pickup_points_anon_security_select on public.pickup_points as restrictive
  for select to anon
  using (is_active);
drop policy if exists pickup_points_authenticated_security_select on public.pickup_points;
create policy pickup_points_authenticated_security_select on public.pickup_points as restrictive
  for select to authenticated
  using (is_active or public.has_role(auth.uid(), 'admin'));

drop policy if exists pickup_points_admin_insert on public.pickup_points;
create policy pickup_points_admin_insert on public.pickup_points
  for insert to authenticated
  with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists pickup_points_admin_update on public.pickup_points;
create policy pickup_points_admin_update on public.pickup_points
  for update to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists pickup_points_admin_delete on public.pickup_points;
create policy pickup_points_admin_delete on public.pickup_points
  for delete to authenticated
  using (public.has_role(auth.uid(), 'admin'));

drop policy if exists zone_fares_public_read on public.zone_fares;
create policy zone_fares_public_read on public.zone_fares
  for select to anon, authenticated
  using (true);

drop policy if exists zone_fares_admin_insert on public.zone_fares;
create policy zone_fares_admin_insert on public.zone_fares
  for insert to authenticated
  with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists zone_fares_admin_update on public.zone_fares;
create policy zone_fares_admin_update on public.zone_fares
  for update to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists zone_fares_admin_delete on public.zone_fares;
create policy zone_fares_admin_delete on public.zone_fares
  for delete to authenticated
  using (public.has_role(auth.uid(), 'admin'));

revoke all on public.pickup_points, public.zone_fares from public, anon, authenticated;
grant select on public.pickup_points, public.zone_fares to anon, authenticated;
grant insert, update, delete on public.pickup_points, public.zone_fares to authenticated;
grant all on public.pickup_points, public.zone_fares to service_role;

revoke all on public.profiles, public.user_roles, public.app_settings,
  public.fare_settings, public.bookings, public.payments, public.reviews,
  public.audit_log from public, anon;
grant select on public.app_settings, public.fare_settings to anon;

revoke all on public.profiles, public.user_roles, public.app_settings,
  public.fare_settings, public.bookings, public.payments, public.reviews,
  public.audit_log from authenticated;
grant all on public.profiles, public.user_roles, public.app_settings,
  public.fare_settings, public.bookings, public.payments, public.reviews,
  public.audit_log to service_role;
grant select, update on public.profiles to authenticated;
grant select on public.user_roles, public.bookings, public.payments,
  public.audit_log to authenticated;
grant select, insert, update on public.reviews to authenticated;
grant select, update on public.app_settings, public.fare_settings to authenticated;
revoke insert, update, delete on public.user_roles from anon, authenticated;

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.app_settings enable row level security;
alter table public.fare_settings enable row level security;
alter table public.bookings enable row level security;
alter table public.payments enable row level security;
alter table public.reviews enable row level security;
alter table public.audit_log enable row level security;

drop policy if exists profiles_admin_security_select on public.profiles;
create policy profiles_admin_security_select on public.profiles as restrictive
  for select to authenticated
  using (id = auth.uid() or public.has_role(auth.uid(), 'admin'));
drop policy if exists profiles_owner_security_update on public.profiles;
create policy profiles_owner_security_update on public.profiles as restrictive
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists roles_owner_security_select on public.user_roles;
create policy roles_owner_security_select on public.user_roles as restrictive
  for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

drop policy if exists app_settings_public_security_select on public.app_settings;
create policy app_settings_public_security_select on public.app_settings as restrictive
  for select to anon, authenticated using (true);
drop policy if exists app_settings_admin_security_update on public.app_settings;
create policy app_settings_admin_security_update on public.app_settings as restrictive
  for update to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists fare_settings_public_security_select on public.fare_settings;
create policy fare_settings_public_security_select on public.fare_settings as restrictive
  for select to anon, authenticated using (true);
drop policy if exists fare_settings_admin_security_update on public.fare_settings;
create policy fare_settings_admin_security_update on public.fare_settings as restrictive
  for update to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists bookings_owner_admin_security_select on public.bookings;
create policy bookings_owner_admin_security_select on public.bookings as restrictive
  for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

drop policy if exists payments_owner_admin_security_select on public.payments;
create policy payments_owner_admin_security_select on public.payments as restrictive
  for select to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or exists (
      select 1 from public.bookings b
      where b.id = booking_id and b.user_id = auth.uid()
    )
  );

drop policy if exists reviews_owner_admin_security_select on public.reviews;
create policy reviews_owner_admin_security_select on public.reviews as restrictive
  for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
drop policy if exists reviews_owner_security_insert on public.reviews;
create policy reviews_owner_security_insert on public.reviews as restrictive
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.bookings b
      where b.id = booking_id and b.user_id = auth.uid() and b.status = 'completed'
    )
  );
drop policy if exists reviews_owner_security_update on public.reviews;
create policy reviews_owner_security_update on public.reviews as restrictive
  for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.bookings b
      where b.id = booking_id and b.user_id = auth.uid() and b.status = 'completed'
    )
  );

drop policy if exists audit_admin_security_select on public.audit_log;
create policy audit_admin_security_select on public.audit_log as restrictive
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

drop policy if exists pickup_points_admin_security_insert on public.pickup_points;
create policy pickup_points_admin_security_insert on public.pickup_points as restrictive
  for insert to authenticated
  with check (public.has_role(auth.uid(), 'admin'));
drop policy if exists pickup_points_admin_security_update on public.pickup_points;
create policy pickup_points_admin_security_update on public.pickup_points as restrictive
  for update to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));
drop policy if exists pickup_points_admin_security_delete on public.pickup_points;
create policy pickup_points_admin_security_delete on public.pickup_points as restrictive
  for delete to authenticated
  using (public.has_role(auth.uid(), 'admin'));

drop policy if exists zone_fares_admin_security_insert on public.zone_fares;
create policy zone_fares_admin_security_insert on public.zone_fares as restrictive
  for insert to authenticated
  with check (public.has_role(auth.uid(), 'admin'));
drop policy if exists zone_fares_admin_security_update on public.zone_fares;
create policy zone_fares_admin_security_update on public.zone_fares as restrictive
  for update to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));
drop policy if exists zone_fares_admin_security_delete on public.zone_fares;
create policy zone_fares_admin_security_delete on public.zone_fares as restrictive
  for delete to authenticated
  using (public.has_role(auth.uid(), 'admin'));

drop policy if exists reviews_update on public.reviews;
drop policy if exists "reviews_update" on public.reviews;
create policy reviews_update on public.reviews
  for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.bookings b
      where b.id = booking_id
        and b.user_id = auth.uid()
        and b.status = 'completed'
    )
  );

alter table storage.objects enable row level security;
drop policy if exists gosh_private_buckets_anon_select on storage.objects;
create policy gosh_private_buckets_anon_select on storage.objects as restrictive
  for select to anon
  using (bucket_id not in ('qris', 'payment-proofs'));
drop policy if exists gosh_private_buckets_anon_insert on storage.objects;
create policy gosh_private_buckets_anon_insert on storage.objects as restrictive
  for insert to anon
  with check (bucket_id not in ('qris', 'payment-proofs'));
drop policy if exists gosh_private_buckets_anon_update on storage.objects;
create policy gosh_private_buckets_anon_update on storage.objects as restrictive
  for update to anon
  using (bucket_id not in ('qris', 'payment-proofs'))
  with check (bucket_id not in ('qris', 'payment-proofs'));
drop policy if exists gosh_private_buckets_anon_delete on storage.objects;
create policy gosh_private_buckets_anon_delete on storage.objects as restrictive
  for delete to anon
  using (bucket_id not in ('qris', 'payment-proofs'));

drop policy if exists gosh_private_buckets_authenticated_select on storage.objects;
create policy gosh_private_buckets_authenticated_select on storage.objects as restrictive
  for select to authenticated
  using (
    bucket_id not in ('qris', 'payment-proofs')
    or bucket_id = 'qris'
    or (
      bucket_id = 'payment-proofs'
      and (
        (storage.foldername(name))[1] = auth.uid()::text
        or public.has_role(auth.uid(), 'admin')
      )
    )
  );
drop policy if exists gosh_private_buckets_authenticated_insert on storage.objects;
create policy gosh_private_buckets_authenticated_insert on storage.objects as restrictive
  for insert to authenticated
  with check (
    bucket_id not in ('qris', 'payment-proofs')
    or (bucket_id = 'qris' and public.has_role(auth.uid(), 'admin'))
    or (bucket_id = 'payment-proofs' and (storage.foldername(name))[1] = auth.uid()::text)
  );
drop policy if exists gosh_private_buckets_authenticated_update on storage.objects;
create policy gosh_private_buckets_authenticated_update on storage.objects as restrictive
  for update to authenticated
  using (
    bucket_id not in ('qris', 'payment-proofs')
    or (bucket_id = 'qris' and public.has_role(auth.uid(), 'admin'))
    or (bucket_id = 'payment-proofs' and (storage.foldername(name))[1] = auth.uid()::text)
  )
  with check (
    bucket_id not in ('qris', 'payment-proofs')
    or (bucket_id = 'qris' and public.has_role(auth.uid(), 'admin'))
    or (bucket_id = 'payment-proofs' and (storage.foldername(name))[1] = auth.uid()::text)
  );
drop policy if exists gosh_private_buckets_authenticated_delete on storage.objects;
create policy gosh_private_buckets_authenticated_delete on storage.objects as restrictive
  for delete to authenticated
  using (
    bucket_id not in ('qris', 'payment-proofs')
    or (bucket_id = 'qris' and public.has_role(auth.uid(), 'admin'))
    or (bucket_id = 'payment-proofs' and public.has_role(auth.uid(), 'admin'))
  );

create or replace function public.create_booking(
  p_pickup text,
  p_destination text,
  p_pickup_at timestamptz,
  p_trip_type text,
  p_notes text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_fare numeric;
  v_existing uuid;
  v_id uuid;
  v_pickup_zone text;
  v_destination_zone text;
begin
  if v_uid is null then raise exception 'Silakan login terlebih dahulu'; end if;
  if p_request_id is null then raise exception 'Permintaan tidak valid'; end if;

  select id into v_existing
  from public.bookings
  where user_id = v_uid and request_id = p_request_id;
  if v_existing is not null then return public.booking_json(v_existing); end if;

  if length(trim(coalesce(p_pickup, ''))) < 2 or length(p_pickup) > 200 then
    raise exception 'Titik jemput tidak valid';
  end if;
  if length(trim(coalesce(p_destination, ''))) < 2 or length(p_destination) > 200 then
    raise exception 'Tujuan tidak valid';
  end if;
  if lower(trim(p_pickup)) = lower(trim(p_destination)) then
    raise exception 'Titik jemput dan tujuan harus berbeda';
  end if;
  if p_notes is not null and length(p_notes) > 500 then
    raise exception 'Catatan terlalu panjang';
  end if;
  if p_trip_type is null or p_trip_type not in ('one_way', 'round_trip') then
    raise exception 'Jenis perjalanan tidak valid';
  end if;
  if p_pickup_at < now() + interval '15 minutes' then
    raise exception 'Waktu jemput minimal 15 menit dari sekarang';
  end if;
  if p_pickup_at > now() + interval '60 days' then
    raise exception 'Waktu jemput maksimal 60 hari ke depan';
  end if;

  if (select count(*)
      from public.bookings b
      join public.payments p on p.booking_id = b.id
      where b.user_id = v_uid and b.status = 'pending' and p.status = 'unpaid') >= 5 then
    raise exception 'Terlalu banyak pesanan belum dibayar. Selesaikan atau batalkan dulu.';
  end if;

  if exists (select 1 from public.pickup_points) then
    select zone into v_pickup_zone
    from public.pickup_points
    where is_active and lower(name) = lower(trim(p_pickup));

    select zone into v_destination_zone
    from public.pickup_points
    where is_active and lower(name) = lower(trim(p_destination));

    if v_pickup_zone is null or v_destination_zone is null then
      raise exception 'Titik jemput atau tujuan tidak tersedia';
    end if;

    if lower(trim(v_pickup_zone)) = lower(trim(v_destination_zone)) then
      select case
        when p_trip_type = 'round_trip' then round_trip_fare
        else one_way_fare
      end
      into v_fare
      from public.fare_settings
      where id = 1;
    else
      select case
        when p_trip_type = 'round_trip' then round_trip_fare
        else one_way_fare
      end
      into v_fare
      from public.zone_fares
      where lower(trim(origin_zone)) = lower(trim(v_pickup_zone))
        and lower(trim(destination_zone)) = lower(trim(v_destination_zone));

      if v_fare is null then
        raise exception 'Tarif untuk rute ini belum tersedia';
      end if;
    end if;
  else
    select case
      when p_trip_type = 'round_trip' then round_trip_fare
      else one_way_fare
    end
    into v_fare
    from public.fare_settings
    where id = 1;
  end if;

  if v_fare is null or v_fare <= 0 then
    raise exception 'Tarif untuk pesanan ini belum dikonfigurasi';
  end if;

  insert into public.bookings (
    code, user_id, pickup_location, destination, pickup_at,
    trip_type, notes, fare, request_id
  )
  values (
    'GOSH-' || lpad(nextval('public.booking_seq')::text, 4, '0'),
    v_uid,
    trim(p_pickup),
    trim(p_destination),
    p_pickup_at,
    p_trip_type,
    nullif(trim(coalesce(p_notes, '')), ''),
    v_fare,
    p_request_id
  )
  returning id into v_id;

  insert into public.payments (booking_id, amount) values (v_id, v_fare);
  return public.booking_json(v_id);
end;
$$;

revoke all on function public.create_booking(text, text, timestamptz, text, text, uuid)
  from public, anon;
grant execute on function public.create_booking(text, text, timestamptz, text, text, uuid)
  to authenticated;

create or replace function public.admin_dashboard_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Hanya admin';
  end if;

  select jsonb_build_object(
    'total_orders', count(distinct b.id),
    'completed_rides', count(distinct b.id) filter (where b.status = 'completed'),
    'pending_orders', count(distinct b.id) filter (where b.status = 'pending'),
    'verified_payments', count(distinct p.id) filter (where p.status = 'verified'),
    'pending_payments', count(distinct p.id) filter (where p.status = 'pending_verification'),
    'unpaid_payments', count(distinct p.id) filter (where p.status = 'unpaid'),
    'rejected_payments', count(distinct p.id) filter (where p.status = 'rejected'),
    'total_revenue', coalesce(sum(p.amount) filter (where p.status = 'verified'), 0)
  )
  into v_result
  from public.bookings b
  left join public.payments p on p.booking_id = b.id;

  return v_result;
end;
$$;

revoke all on function public.admin_dashboard_summary() from public, anon;
grant execute on function public.admin_dashboard_summary() to authenticated;

do $$
begin
  if exists (
    select 1 from auth.users
    where lower(email) = 'adambs1927@gmail.com'
      and email_confirmed_at is not null
  ) then
    insert into public.user_roles (user_id, role)
    select id, 'admin'
    from auth.users
    where lower(email) = 'adambs1927@gmail.com'
      and email_confirmed_at is not null
    on conflict (user_id, role) do nothing;
    raise notice 'Role admin assigned to the verified Supabase Auth account adambs1927@gmail.com.';
  else
    raise notice 'No verified Supabase Auth account for adambs1927@gmail.com yet. Sign up and verify it, then rerun the admin-role block.';
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
