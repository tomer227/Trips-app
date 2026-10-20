-- Moderation screen in the app (#/moderation), instead of editing tables in the dashboard.
-- Run after 0004_hardening.sql.
--
-- Moderators are listed in public.moderators, which only the dashboard can change. To make yourself
-- a moderator, run once in the SQL Editor (with your own email):
--   insert into public.moderators (user_id) select id from auth.users where email = 'you@example.com';
--
-- A moderator sees reported or hidden reviews and partner posts, with the report reasons, and can
-- restore (and clear the reports), keep hidden, or delete. Reporters' identities are never shown.

create table public.moderators (
  user_id uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);

alter table public.moderators enable row level security;
-- No policies: changed only from the dashboard, read only through is_moderator().
revoke all on public.moderators from anon, authenticated;

create function public.is_moderator() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.moderators where user_id = auth.uid());
$$;

-- Everything waiting for a moderator: hidden or reported reviews and partner posts.
create function public.mod_queue()
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
    ) as q (kind, id, body, author, subject, hidden, reports, reasons, created_at)
    order by q.hidden desc, q.reports desc, q.created_at desc
    limit 200;
end $$;

-- p_action: 'restore' (show again and clear its reports), 'hide', or 'delete'.
create function public.mod_act(p_kind text, p_id uuid, p_action text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_moderator() then
    raise exception 'not a moderator' using errcode = '42501';
  end if;
  if p_kind = 'review' then
    if p_action = 'restore' then
      delete from public.reports where review_id = p_id;
      update public.reviews set hidden = false where id = p_id;
    elsif p_action = 'hide' then
      update public.reviews set hidden = true where id = p_id;
    elsif p_action = 'delete' then
      delete from public.reviews where id = p_id;
    else
      raise exception 'invalid action';
    end if;
  elsif p_kind = 'post' then
    if p_action = 'restore' then
      delete from public.partner_reports where post_id = p_id;
      update public.partner_posts set hidden = false where id = p_id;
    elsif p_action = 'hide' then
      update public.partner_posts set hidden = true where id = p_id;
    elsif p_action = 'delete' then
      delete from public.partner_posts where id = p_id;
    else
      raise exception 'invalid action';
    end if;
  else
    raise exception 'invalid kind';
  end if;
end $$;

revoke all on function public.is_moderator() from public, anon;
revoke all on function public.mod_queue() from public, anon;
revoke all on function public.mod_act(text, uuid, text) from public, anon;
grant execute on function public.is_moderator() to authenticated;
grant execute on function public.mod_queue() to authenticated;
grant execute on function public.mod_act(text, uuid, text) to authenticated;
