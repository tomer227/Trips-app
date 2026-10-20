-- Fixes from a security review of 0004–0006. Run after 0006_meetups.sql.
--
--   * Daily limits count an append-only log, so creating and deleting again does not get around them.
--   * A moderator's "restore" keeps the reports (marked cleared) instead of deleting them, so the same
--     three accounts cannot report the item again and hide it straight away.
--   * The "3 upcoming meetups" cap counts every meetup still on the board (until 12 h after it starts).
--   * Organisers cannot add themselves to "coming", and the head count is only for visible meetups.
--   * A review cannot be moved to another place by editing it.

/* ───────────── append-only activity log for daily limits ───────────── */

create table public.activity_log (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  at timestamptz not null default now()
);

create index activity_log_idx on public.activity_log (user_id, kind, at);

alter table public.activity_log enable row level security;
-- No policies: written and read only by the limit functions below.
revoke all on public.activity_log from anon, authenticated;

-- Records one action and fails when the user already did `p_max` of this kind in the last day.
-- Runs inside the insert's transaction, so a failed insert leaves no log row.
create function public.log_activity(p_user uuid, p_kind text, p_max int, p_message text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.activity_log where user_id = p_user and kind = p_kind and at > now() - interval '1 day') >= p_max then
    raise exception '%', p_message using errcode = 'P0001';
  end if;
  insert into public.activity_log (user_id, kind) values (p_user, p_kind);
end $$;

create or replace function public.reviews_rate_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.log_activity(new.user_id, 'review', 30, 'review rate limit reached');
  return new;
end $$;

create or replace function public.partner_posts_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.partner_posts
        where user_id = new.user_id and to_date >= current_date) >= 5 then
    raise exception 'partner post limit reached' using errcode = 'P0001';
  end if;
  perform public.log_activity(new.user_id, 'partner_post', 10, 'partner post rate limit reached');
  return new;
end $$;

create or replace function public.partner_replies_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.log_activity(new.user_id, 'partner_reply', 30, 'partner reply rate limit reached');
  return new;
end $$;

create or replace function public.meetups_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.starts_at < now() - interval '1 hour' or new.starts_at > now() + interval '60 days' then
    raise exception 'meetup date out of range' using errcode = 'P0001';
  end if;
  -- Everything still on the board counts, including meetups that started in the last 12 hours.
  if (select count(*) from public.meetups where user_id = new.user_id and starts_at > now() - interval '12 hours') >= 3 then
    raise exception 'meetup limit reached' using errcode = 'P0001';
  end if;
  perform public.log_activity(new.user_id, 'meetup', 10, 'meetup rate limit reached');
  return new;
end $$;

/* ───────────── reports survive a restore ───────────── */

alter table public.reports add column cleared boolean not null default false;
alter table public.partner_reports add column cleared boolean not null default false;
alter table public.meetup_reports add column cleared boolean not null default false;

create or replace function public.reports_auto_hide() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(distinct reporter_id) from public.reports where review_id = new.review_id and not cleared) >= 3 then
    update public.reviews set hidden = true where id = new.review_id;
  end if;
  return new;
end $$;

create or replace function public.partner_reports_auto_hide() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(distinct reporter_id) from public.partner_reports where post_id = new.post_id and not cleared) >= 3 then
    update public.partner_posts set hidden = true where id = new.post_id;
  end if;
  return new;
end $$;

create or replace function public.meetup_reports_auto_hide() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(distinct reporter_id) from public.meetup_reports where meetup_id = new.meetup_id and not cleared) >= 3 then
    update public.meetups set hidden = true where id = new.meetup_id;
  end if;
  return new;
end $$;

-- Only open (not cleared) reports count and are shown.
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
      left join public.reports rep on rep.review_id = r.id and not rep.cleared
      group by r.id, p.display_name
      having r.hidden or count(rep.id) > 0
      union all
      select 'post'::text, pp.id, pp.body, p.display_name, pp.country_id, pp.hidden, count(rep.id),
             coalesce(array_agg(rep.reason) filter (where rep.reason <> ''), '{}'), pp.created_at
      from public.partner_posts pp
      left join public.profiles p on p.id = pp.user_id
      left join public.partner_reports rep on rep.post_id = pp.id and not rep.cleared
      group by pp.id, p.display_name
      having pp.hidden or count(rep.id) > 0
      union all
      select 'meetup'::text, m.id, m.title || E'\n' || m.place_label || case when m.body <> '' then E'\n' || m.body else '' end,
             p.display_name, m.country_id, m.hidden, count(rep.id),
             coalesce(array_agg(rep.reason) filter (where rep.reason <> ''), '{}'), m.created_at
      from public.meetups m
      left join public.profiles p on p.id = m.user_id
      left join public.meetup_reports rep on rep.meetup_id = m.id and not rep.cleared
      group by m.id, p.display_name
      having m.hidden or count(rep.id) > 0
    ) as q (kind, id, body, author, subject, hidden, reports, reasons, created_at)
    order by q.hidden desc, q.reports desc, q.created_at desc
    limit 200;
end $$;

-- "restore" now clears the reports instead of deleting them; the earlier reporters cannot report again.
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
      update public.reports set cleared = true where review_id = p_id;
      update public.reviews set hidden = false where id = p_id;
    elsif p_action = 'hide' then
      update public.reviews set hidden = true where id = p_id;
    else
      delete from public.reviews where id = p_id;
    end if;
  elsif p_kind = 'post' then
    if p_action = 'restore' then
      update public.partner_reports set cleared = true where post_id = p_id;
      update public.partner_posts set hidden = false where id = p_id;
    elsif p_action = 'hide' then
      update public.partner_posts set hidden = true where id = p_id;
    else
      delete from public.partner_posts where id = p_id;
    end if;
  elsif p_kind = 'meetup' then
    if p_action = 'restore' then
      update public.meetup_reports set cleared = true where meetup_id = p_id;
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

/* ───────────── meetups: "coming" ───────────── */

drop policy "users say they are coming to visible meetups" on public.meetup_going;
create policy "users say they are coming to visible meetups"
  on public.meetup_going for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.meetups m
      where m.id = meetup_id and not m.hidden and m.starts_at > now() - interval '12 hours' and m.user_id <> (select auth.uid())
    )
  );

create or replace function public.meetup_going_count(p_meetup uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select count(*) from public.meetup_going g
  where g.meetup_id = p_meetup
    and exists (select 1 from public.meetups m where m.id = p_meetup and not m.hidden and m.starts_at > now() - interval '12 hours');
$$;

/* ───────────── reviews stay on their place ───────────── */

create or replace function public.reviews_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id;
    new.place_id := old.place_id;
    new.created_at := old.created_at;
    if current_user in ('anon', 'authenticated') then
      new.hidden := old.hidden;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

/* ───────────── privileges ───────────── */

revoke all on function public.log_activity(uuid, text, int, text) from public, anon, authenticated;
revoke all on function public.reviews_rate_limit() from public, anon, authenticated;
revoke all on function public.partner_posts_limit() from public, anon, authenticated;
revoke all on function public.partner_replies_limit() from public, anon, authenticated;
revoke all on function public.meetups_limit() from public, anon, authenticated;
revoke all on function public.reports_auto_hide() from public, anon, authenticated;
revoke all on function public.partner_reports_auto_hide() from public, anon, authenticated;
revoke all on function public.meetup_reports_auto_hide() from public, anon, authenticated;
revoke all on function public.reviews_guard() from public, anon, authenticated;
revoke all on function public.mod_queue() from public, anon;
revoke all on function public.mod_act(text, uuid, text) from public, anon;
grant execute on function public.mod_queue() to authenticated;
grant execute on function public.mod_act(text, uuid, text) to authenticated;
revoke all on function public.meetup_going_count(uuid) from public, anon;
grant execute on function public.meetup_going_count(uuid) to authenticated;
