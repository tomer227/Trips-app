-- "הטיול הגדול" – accounts, private sync and shared reviews.
-- Paste into Supabase: SQL Editor → New query → Run. Safe to run once on a fresh project.
--
-- Security model: every table has Row Level Security. The public "anon" key that ships in the
-- app can only do what the policies below allow.
--   profiles   : everyone can read display names; you can edit only your own.
--   user_data  : private. Only the owner can read or write their synced trip/journal/checklist.
--   reviews    : everyone can read visible reviews; you can write/edit/delete only your own.
--   reports    : you can file a report; nobody can read reports through the API.


/* ───────────── profiles ───────────── */

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 2 and 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles are readable by everyone"
  on public.profiles for select using (true);

create policy "users update their own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Profiles are created by the trigger below, never by clients.

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  wanted text := btrim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));
begin
  if char_length(wanted) < 2 or char_length(wanted) > 30 then
    wanted := 'מטייל ' || substr(replace(new.id::text, '-', ''), 1, 4);
  end if;
  insert into public.profiles (id, display_name) values (new.id, wanted);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

/* ───────────── private synced data ───────────── */

create table public.user_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb check (pg_column_size(data) < 2000000),
  updated_at timestamptz not null default now()
);

alter table public.user_data enable row level security;

create policy "owner reads own data"
  on public.user_data for select to authenticated
  using (user_id = (select auth.uid()));

create policy "owner inserts own data"
  on public.user_data for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "owner updates own data"
  on public.user_data for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "owner deletes own data"
  on public.user_data for delete to authenticated
  using (user_id = (select auth.uid()));

create trigger user_data_touch before update on public.user_data
  for each row execute function public.touch_updated_at();

/* ───────────── shared reviews ───────────── */

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  place_id text not null check (char_length(place_id) between 1 and 200),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  body text not null default '' check (char_length(body) <= 2000),
  visited text not null check (visited ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  cost_usd numeric(10, 2) check (cost_usd is null or (cost_usd >= 0 and cost_usd <= 100000)),
  tags text[] not null default '{}'
    check (cardinality(tags) <= 8
      and tags <@ array['safe-alone', 'unsafe', 'israelis', 'packed', 'no-israelis', 'cheap', 'expensive', 'vibe']),
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, place_id)
);

create index reviews_place_idx on public.reviews (place_id) where not hidden;

alter table public.reviews enable row level security;

create policy "visible reviews are public"
  on public.reviews for select using (not hidden or user_id = (select auth.uid()));

create policy "users write their own reviews"
  on public.reviews for insert to authenticated
  with check (user_id = (select auth.uid()) and not hidden);

create policy "users edit their own reviews"
  on public.reviews for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "users delete their own reviews"
  on public.reviews for delete to authenticated
  using (user_id = (select auth.uid()));

-- Authorship never changes. Ordinary users (anon / authenticated) also cannot change moderation
-- state; the auto-hide trigger below and moderators working in the dashboard can.
create function public.reviews_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id;
    new.created_at := old.created_at;
    if current_user in ('anon', 'authenticated') then
      new.hidden := old.hidden;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger reviews_guard_trg before insert or update on public.reviews
  for each row execute function public.reviews_guard();

-- At most 30 new reviews per user per day.
create function public.reviews_rate_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.reviews
        where user_id = new.user_id and created_at > now() - interval '1 day') >= 30 then
    raise exception 'review rate limit reached' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger reviews_rate_limit_trg before insert on public.reviews
  for each row execute function public.reviews_rate_limit();

-- Reviews with the author's display name, for the app to read in one request.
create view public.reviews_public with (security_invoker = true) as
  select r.id, r.place_id, r.user_id, r.stars, r.body, r.visited, r.cost_usd, r.tags, r.created_at,
         p.display_name as author
  from public.reviews r
  left join public.profiles p on p.id = r.user_id
  where not r.hidden;

grant select on public.reviews_public to anon, authenticated;

/* ───────────── reports & simple moderation ───────────── */

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews (id) on delete cascade,
  reporter_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reason text not null default '' check (char_length(reason) <= 500),
  created_at timestamptz not null default now(),
  unique (review_id, reporter_id)
);

alter table public.reports enable row level security;

create policy "users file their own reports"
  on public.reports for insert to authenticated
  with check (reporter_id = (select auth.uid()));
-- No select/update/delete policy: reports are readable only from the Supabase dashboard.

-- Three different reporters hide a review until a moderator looks at it.
create function public.reports_auto_hide() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(distinct reporter_id) from public.reports where review_id = new.review_id) >= 3 then
    update public.reviews set hidden = true where id = new.review_id;
  end if;
  return new;
end $$;

create trigger reports_auto_hide_trg after insert on public.reports
  for each row execute function public.reports_auto_hide();

/* ───────────── account deletion ───────────── */

-- Lets a signed-in user delete their own account and everything attached to it (cascades).
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end $$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

/* ───────────── table privileges (defence in depth on top of RLS) ───────────── */

revoke all on public.user_data from anon;
revoke all on public.reports from anon;
revoke insert, update, delete on public.profiles from anon;
revoke insert, update, delete on public.reviews from anon;
