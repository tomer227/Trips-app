-- Security hardening found in the October 2026 review. Run after 0003_partner_board.sql.
--
--   1. created_at is always set by the database. Before this, a client could send an old
--      created_at and slip past the daily limits on reviews, partner posts and replies.
--   2. At most 20 reports a day per user (reviews and partner posts together), so one person
--      with a few accounts cannot quietly hide many posts.
--   3. "מי עוד שם": sharing fake dates in every country is no longer a way to list everyone.
--      Only future dates count, at most 15 stops and 400 days in total, and at most 30 real
--      changes a day. Saving the same trip again is free (the app does that on every visit).
--   4. Trigger and helper functions cannot be called directly through the API.


/* ───────────── 1. created_at comes from the server ───────────── */

create function public.force_created_now() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.created_at := now();
  return new;
end $$;

-- Named with a leading "a_" so it runs before the other insert triggers on the same table.
create trigger a_reviews_created_now before insert on public.reviews
  for each row execute function public.force_created_now();
create trigger a_reports_created_now before insert on public.reports
  for each row execute function public.force_created_now();
create trigger a_trip_windows_created_now before insert on public.trip_windows
  for each row execute function public.force_created_now();
create trigger a_partner_posts_created_now before insert on public.partner_posts
  for each row execute function public.force_created_now();
create trigger a_partner_replies_created_now before insert on public.partner_replies
  for each row execute function public.force_created_now();
create trigger a_partner_reports_created_now before insert on public.partner_reports
  for each row execute function public.force_created_now();

/* ───────────── 2. report rate limit ───────────── */

create function public.reports_rate_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := new.reporter_id;
begin
  if (select count(*) from public.reports where reporter_id = me and created_at > now() - interval '1 day')
     + (select count(*) from public.partner_reports where reporter_id = me and created_at > now() - interval '1 day') >= 20 then
    raise exception 'report rate limit reached' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger reports_rate_limit_trg before insert on public.reports
  for each row execute function public.reports_rate_limit();
create trigger partner_reports_rate_limit_trg before insert on public.partner_reports
  for each row execute function public.reports_rate_limit();

/* ───────────── 3. "מי עוד שם" limits ───────────── */

create table public.trip_changes (
  user_id uuid not null references auth.users (id) on delete cascade,
  changed_at timestamptz not null default now()
);

create index trip_changes_user_idx on public.trip_changes (user_id, changed_at);

alter table public.trip_changes enable row level security;
-- No policies: written only by set_my_trip below.
revoke all on public.trip_changes from anon, authenticated;

create or replace function public.set_my_trip(p_windows jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  wanted jsonb;
  existing jsonb;
begin
  if me is null then
    raise exception 'not signed in';
  end if;
  if jsonb_typeof(p_windows) <> 'array' or jsonb_array_length(p_windows) > 30 then
    raise exception 'invalid trip';
  end if;

  -- Only stops that have not ended yet matter for matching; past ones are dropped.
  select coalesce(jsonb_agg(w order by w ->> 'country_id', w ->> 'from_date', w ->> 'to_date'), '[]'::jsonb)
    into wanted
    from (
      select distinct jsonb_build_object(
               'country_id', x ->> 'country_id',
               'from_date', greatest((x ->> 'from_date')::date, current_date)::text,
               'to_date', ((x ->> 'to_date')::date)::text) as w
      from jsonb_array_elements(p_windows) as x
      where (x ->> 'to_date')::date >= current_date
    ) s;

  if jsonb_array_length(wanted) > 15 then
    raise exception 'too many trip stops' using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_array_elements(wanted) w where (w ->> 'from_date')::date > current_date + 730) then
    raise exception 'trip too far ahead' using errcode = 'P0001';
  end if;
  if (select coalesce(sum((w ->> 'to_date')::date - (w ->> 'from_date')::date + 1), 0) from jsonb_array_elements(wanted) w) > 400 then
    raise exception 'trip too long' using errcode = 'P0001';
  end if;

  select coalesce(jsonb_agg(w order by w ->> 'country_id', w ->> 'from_date', w ->> 'to_date'), '[]'::jsonb)
    into existing
    from (
      select jsonb_build_object('country_id', country_id, 'from_date', greatest(from_date, current_date)::text, 'to_date', to_date::text) as w
      from public.trip_windows
      where user_id = me and to_date >= current_date
    ) s;

  if wanted = existing then
    return;
  end if;

  if (select count(*) from public.trip_changes where user_id = me and changed_at > now() - interval '1 day') >= 30 then
    raise exception 'trip change rate limit reached' using errcode = 'P0001';
  end if;
  insert into public.trip_changes (user_id) values (me);
  delete from public.trip_changes where user_id = me and changed_at < now() - interval '2 days';

  delete from public.trip_windows where user_id = me;
  insert into public.trip_windows (user_id, country_id, from_date, to_date)
    select me, w ->> 'country_id', (w ->> 'from_date')::date, (w ->> 'to_date')::date
    from jsonb_array_elements(wanted) as w;
end $$;

revoke all on function public.set_my_trip(jsonb) from public, anon;
grant execute on function public.set_my_trip(jsonb) to authenticated;

/* ───────────── 4. functions are not part of the API ───────────── */

revoke all on function public.force_created_now() from public, anon, authenticated;
revoke all on function public.touch_updated_at() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.reviews_guard() from public, anon, authenticated;
revoke all on function public.reviews_rate_limit() from public, anon, authenticated;
revoke all on function public.reports_auto_hide() from public, anon, authenticated;
revoke all on function public.reports_rate_limit() from public, anon, authenticated;
revoke all on function public.partner_posts_limit() from public, anon, authenticated;
revoke all on function public.partner_replies_limit() from public, anon, authenticated;
revoke all on function public.partner_reports_auto_hide() from public, anon, authenticated;
