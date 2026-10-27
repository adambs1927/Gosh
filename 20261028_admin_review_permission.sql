begin;

alter table public.bookings
  add column if not exists review_allowed boolean not null default false;

update public.bookings b
set review_allowed = true
where exists (
  select 1 from public.reviews r where r.booking_id = b.id
);

create or replace function public.admin_allow_review(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Hanya admin';
  end if;

  select status into v_status
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'Pesanan tidak ditemukan';
  end if;
  if v_status <> 'completed' then
    raise exception 'Perjalanan harus selesai sebelum ulasan diizinkan';
  end if;

  update public.bookings
  set review_allowed = true, updated_at = now()
  where id = p_booking_id;

  insert into public.audit_log (actor, action, booking_id)
  values (auth.uid(), 'review_allowed', p_booking_id);
end;
$$;

revoke all on function public.admin_allow_review(uuid) from public, anon;
grant execute on function public.admin_allow_review(uuid) to authenticated;

drop policy if exists reviews_owner_security_insert on public.reviews;
create policy reviews_owner_security_insert on public.reviews as restrictive
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and b.user_id = auth.uid()
        and b.status = 'completed'
        and b.review_allowed
    )
  );

drop policy if exists reviews_owner_security_update on public.reviews;
create policy reviews_owner_security_update on public.reviews as restrictive
  for update to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and b.user_id = auth.uid()
        and b.status = 'completed'
        and b.review_allowed
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and b.user_id = auth.uid()
        and b.status = 'completed'
        and b.review_allowed
    )
  );

notify pgrst, 'reload schema';
commit;
