begin;

create or replace view public.review_feed
with (security_barrier = true)
as
select rating, comment, created_at
from public.reviews;

revoke all on public.review_feed from public, anon, authenticated;
grant select on public.review_feed to authenticated;

notify pgrst, 'reload schema';
commit;
