-- "מי עוד שם": travellers who chose to share their trip dates see who else will be in the same
-- country at the same time. Run after 0001_init.sql (SQL Editor → New query → Run).
--
-- Privacy model:
--   * Only the country and the dates are shared, never a city or a live location.
--   * Sharing is opt-in, and you see others only while you share yourself.
--   * Nobody can read trip_windows directly; who_else_there() returns only display names and the
--     dates that overlap the caller's own trip.

create table public.trip_windows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  country_id text not null check (country_id ~ '^[a-z-]{2,40}$'),
  from_date date not null,
  to_date date not null,
  created_at timestamptz not null default now(),
  check (to_date >= from_date and to_date - from_date <= 366)
);

create index trip_windows_country_idx on public.trip_windows (country_id, to_date);
create index trip_windows_user_idx on public.trip_windows (user_id);

alter table public.trip_windows enable row level security;
-- No policies: the table is reachable only through the two functions below.
revoke all on public.trip_windows from anon, authenticated;

-- Replaces the caller's whole trip. An empty array stops sharing.
create function public.set_my_trip(p_windows jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not signed in';
  end if;
  if jsonb_typeof(p_windows) <> 'array' or jsonb_array_length(p_windows) > 30 then
    raise exception 'invalid trip';
  end if;
  delete from public.trip_windows where user_id = me;
  insert into public.trip_windows (user_id, country_id, from_date, to_date)
    select me, w ->> 'country_id', (w ->> 'from_date')::date, (w ->> 'to_date')::date
    from jsonb_array_elements(p_windows) as w;
end $$;

-- Other travellers whose dates overlap the caller's own shared dates, from today on.
create function public.who_else_there()
returns table (display_name text, country_id text, from_date date, to_date date)
language sql stable security definer set search_path = '' as $$
  select p.display_name, o.country_id, o.from_date, o.to_date
  from public.trip_windows o
  join public.profiles p on p.id = o.user_id
  where o.user_id <> auth.uid()
    and o.to_date >= current_date
    and exists (
      select 1 from public.trip_windows m
      where m.user_id = auth.uid()
        and m.country_id = o.country_id
        and m.from_date <= o.to_date
        and o.from_date <= m.to_date
    )
  order by o.from_date
  limit 200;
$$;

revoke all on function public.set_my_trip(jsonb) from public, anon;
revoke all on function public.who_else_there() from public, anon;
grant execute on function public.set_my_trip(jsonb) to authenticated;
grant execute on function public.who_else_there() to authenticated;
