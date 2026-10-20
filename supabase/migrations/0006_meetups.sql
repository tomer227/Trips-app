-- "מפגשים על המפה": signed-in travellers pin a meetup (Friday dinner, a hike, a night out) at a
-- public spot, with a date and time. Others see it on the map and can say they are coming.
-- Run after 0005_moderation.sql.
--
-- Privacy and safety model:
--   * Only signed-in users see meetups, like the partner board. The app asks for a public spot.
--   * A meetup shows the organiser's display name and how many are coming, never who.
--   * Meetups disappear 12 hours after they start. Three reports hide one until a moderator looks.

/* ───────────── meetups ───────────── */

create table public.meetups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  country_id text not null check (country_id ~ '^[a-z-]{2,40}$'),
  title text not null check (char_length(btrim(title)) between 4 and 80),
  body text not null default '' check (char_length(body) <= 400),
  place_label text not null check (char_length(btrim(place_label)) between 2 and 60),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  starts_at timestamptz not null,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);

create index meetups_board_idx on public.meetups (starts_at) where not hidden;
create index meetups_user_idx on public.meetups (user_id);

alter table public.meetups enable row level security;

create policy "signed-in users read upcoming meetups"
  on public.meetups for select to authenticated
  using ((not hidden and starts_at > now() - interval '12 hours') or user_id = (select auth.uid()));

create policy "users create their own meetups"
  on public.meetups for insert to authenticated
  with check (user_id = (select auth.uid()) and not hidden);

create policy "users delete their own meetups"
  on public.meetups for delete to authenticated
  using (user_id = (select auth.uid()));

create trigger a_meetups_created_now before insert on public.meetups
  for each row execute function public.force_created_now();

-- Starts within the next 60 days; at most 3 upcoming meetups and 10 new ones a day per user.
create function public.meetups_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.starts_at < now() - interval '1 hour' or new.starts_at > now() + interval '60 days' then
    raise exception 'meetup date out of range' using errcode = 'P0001';
  end if;
  if (select count(*) from public.meetups where user_id = new.user_id and starts_at > now()) >= 3 then
    raise exception 'meetup limit reached' using errcode = 'P0001';
  end if;
  if (select count(*) from public.meetups where user_id = new.user_id and created_at > now() - interval '1 day') >= 10 then
    raise exception 'meetup rate limit reached' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger meetups_limit_trg before insert on public.meetups
  for each row execute function public.meetups_limit();

/* ───────────── "I'm coming" ───────────── */

create table public.meetup_going (
  meetup_id uuid not null references public.meetups (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (meetup_id, user_id)
);

alter table public.meetup_going enable row level security;

-- You see only your own "coming" rows; counts come from the view below.
create policy "users read their own going"
  on public.meetup_going for select to authenticated
  using (user_id = (select auth.uid()));

create policy "users say they are coming to visible meetups"
  on public.meetup_going for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.meetups m where m.id = meetup_id and not m.hidden and m.starts_at > now() - interval '12 hours')
  );

create policy "users take back their going"
  on public.meetup_going for delete to authenticated
  using (user_id = (select auth.uid()));

-- How many are coming, without revealing who. security definer so others' rows are counted.
create function public.meetup_going_count(p_meetup uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select count(*) from public.meetup_going where meetup_id = p_meetup;
$$;

revoke all on function public.meetup_going_count(uuid) from public, anon;
grant execute on function public.meetup_going_count(uuid) to authenticated;

-- Meetups with the organiser's name, the head count and whether the caller is coming.
create view public.meetups_public with (security_invoker = true) as
  select m.id, m.user_id, m.country_id, m.title, m.body, m.place_label, m.lat, m.lng, m.starts_at, m.created_at,
         p.display_name as author,
         public.meetup_going_count(m.id) as going,
         exists (select 1 from public.meetup_going g where g.meetup_id = m.id and g.user_id = (select auth.uid())) as i_am_going
  from public.meetups m
  left join public.profiles p on p.id = m.user_id
  where not m.hidden;

/* ───────────── reports ───────────── */

create table public.meetup_reports (
  id uuid primary key default gen_random_uuid(),
  meetup_id uuid not null references public.meetups (id) on delete cascade,
  reporter_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reason text not null default '' check (char_length(reason) <= 500),
  created_at timestamptz not null default now(),
  unique (meetup_id, reporter_id)
);

alter table public.meetup_reports enable row level security;

create policy "users file their own meetup reports"
  on public.meetup_reports for insert to authenticated
  with check (reporter_id = (select auth.uid()));

create trigger a_meetup_reports_created_now before insert on public.meetup_reports
  for each row execute function public.force_created_now();

create function public.meetup_reports_auto_hide() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(distinct reporter_id) from public.meetup_reports where meetup_id = new.meetup_id) >= 3 then
    update public.meetups set hidden = true where id = new.meetup_id;
  end if;
  return new;
end $$;

create trigger meetup_reports_auto_hide_trg after insert on public.meetup_reports
  for each row execute function public.meetup_reports_auto_hide();

-- The daily report limit now counts meetup reports too.
create or replace function public.reports_rate_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := new.reporter_id;
begin
  if (select count(*) from public.reports where reporter_id = me and created_at > now() - interval '1 day')
     + (select count(*) from public.partner_reports where reporter_id = me and created_at > now() - interval '1 day')
     + (select count(*) from public.meetup_reports where reporter_id = me and created_at > now() - interval '1 day') >= 20 then
    raise exception 'report rate limit reached' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger meetup_reports_rate_limit_trg before insert on public.meetup_reports
  for each row execute function public.reports_rate_limit();

/* ───────────── moderation covers meetups ───────────── */

create or replace function public.mod_queue()
returns table (kind text, id uuid, body text, author text, subject text, hidden boolean, reports bigint, reasons text[], created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_moderator() then
    raise exception 'not a moderator' using errcode = '42501';
  end if;
  return query
    select q.* from (
      select 'review'::text, r.id, r.body, p.display_name, r.place_id, r.hidden, count(rep.id),
             coalesce(array_agg(rep.reason) filter (where rep.reason <> ''), '{}'), r.created_at
      from public.reviews r
      left join public.profiles p on p.id = r.user_id
      left join public.reports rep on rep.review_id = r.id
      group by r.id, p.display_name
      having r.hidden or count(rep.id) > 0
      union all
      select 'post'::text, pp.id, pp.body, p.display_name, pp.country_id, pp.hidden, count(rep.id),
             coalesce(array_agg(rep.reason) filter (where rep.reason <> ''), '{}'), pp.created_at
      from public.partner_posts pp
      left join public.profiles p on p.id = pp.user_id
      left join public.partner_reports rep on rep.post_id = pp.id
      group by pp.id, p.display_name
      having pp.hidden or count(rep.id) > 0
      union all
      select 'meetup'::text, m.id, m.title || E'\n' || m.place_label || case when m.body <> '' then E'\n' || m.body else '' end,
             p.display_name, m.country_id, m.hidden, count(rep.id),
             coalesce(array_agg(rep.reason) filter (where rep.reason <> ''), '{}'), m.created_at
      from public.meetups m
      left join public.profiles p on p.id = m.user_id
      left join public.meetup_reports rep on rep.meetup_id = m.id
      group by m.id, p.display_name
      having m.hidden or count(rep.id) > 0
    ) as q (kind, id, body, author, subject, hidden, reports, reasons, created_at)
    order by q.hidden desc, q.reports desc, q.created_at desc
    limit 200;
end $$;

create or replace function public.mod_act(p_kind text, p_id uuid, p_action text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_moderator() then
    raise exception 'not a moderator' using errcode = '42501';
  end if;
  if p_action not in ('restore', 'hide', 'delete') then
    raise exception 'invalid action';
  end if;
  if p_kind = 'review' then
    if p_action = 'restore' then
      delete from public.reports where review_id = p_id;
      update public.reviews set hidden = false where id = p_id;
    elsif p_action = 'hide' then
      update public.reviews set hidden = true where id = p_id;
    else
      delete from public.reviews where id = p_id;
    end if;
  elsif p_kind = 'post' then
    if p_action = 'restore' then
      delete from public.partner_reports where post_id = p_id;
      update public.partner_posts set hidden = false where id = p_id;
    elsif p_action = 'hide' then
      update public.partner_posts set hidden = true where id = p_id;
    else
      delete from public.partner_posts where id = p_id;
    end if;
  elsif p_kind = 'meetup' then
    if p_action = 'restore' then
      delete from public.meetup_reports where meetup_id = p_id;
      update public.meetups set hidden = false where id = p_id;
    elsif p_action = 'hide' then
      update public.meetups set hidden = true where id = p_id;
    else
      delete from public.meetups where id = p_id;
    end if;
  else
    raise exception 'invalid kind';
  end if;
end $$;

/* ───────────── privileges ───────────── */

revoke all on public.meetups, public.meetup_going, public.meetup_reports, public.meetups_public from anon;
revoke update on public.meetups, public.meetup_going, public.meetup_reports from authenticated;
grant select on public.meetups_public to authenticated;
revoke all on function public.meetups_limit() from public, anon, authenticated;
revoke all on function public.meetup_reports_auto_hide() from public, anon, authenticated;
revoke all on function public.reports_rate_limit() from public, anon, authenticated;
revoke all on function public.mod_queue() from public, anon;
revoke all on function public.mod_act(text, uuid, text) from public, anon;
grant execute on function public.mod_queue() to authenticated;
grant execute on function public.mod_act(text, uuid, text) to authenticated;
