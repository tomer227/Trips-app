-- "מחפשים שותף": a board where signed-in travellers post that they are looking for partners
-- (a trek, a stretch of the route, a ride, a room to share) and others answer privately.
-- Run after 0002_who_else_there.sql (SQL Editor → New query → Run).
--
-- Privacy and safety model:
--   * Only signed-in users can read the board. Posts show a display name, never an email.
--   * A post holds no contact details. Someone who is interested sends a private reply, and only
--     the post's author and the replier can read it. The replier decides what contact to share.
--   * Posts disappear from the board after their end date. Three reports hide a post until a
--     moderator looks at it in the dashboard.

/* ───────────── posts ───────────── */

create table public.partner_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  country_id text not null check (country_id ~ '^[a-z-]{2,40}$'),
  from_date date not null,
  to_date date not null,
  kind text not null check (kind in ('trek', 'route', 'ride', 'room', 'hangout')),
  body text not null check (char_length(btrim(body)) between 10 and 400),
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  check (to_date >= from_date and to_date - from_date <= 366)
);

create index partner_posts_board_idx on public.partner_posts (country_id, to_date) where not hidden;
create index partner_posts_user_idx on public.partner_posts (user_id);

alter table public.partner_posts enable row level security;

create policy "signed-in users read current posts"
  on public.partner_posts for select to authenticated
  using ((not hidden and to_date >= current_date) or user_id = (select auth.uid()));

create policy "users write their own posts"
  on public.partner_posts for insert to authenticated
  with check (user_id = (select auth.uid()) and not hidden);

create policy "users delete their own posts"
  on public.partner_posts for delete to authenticated
  using (user_id = (select auth.uid()));

-- No update policy: to change a post, delete it and post again.

-- At most 5 current posts and 10 new posts a day per user.
create function public.partner_posts_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.partner_posts
        where user_id = new.user_id and to_date >= current_date) >= 5 then
    raise exception 'partner post limit reached' using errcode = 'P0001';
  end if;
  if (select count(*) from public.partner_posts
        where user_id = new.user_id and created_at > now() - interval '1 day') >= 10 then
    raise exception 'partner post rate limit reached' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger partner_posts_limit_trg before insert on public.partner_posts
  for each row execute function public.partner_posts_limit();

-- Posts with the author's display name. security_invoker: the caller's own policies apply.
create view public.partner_posts_public with (security_invoker = true) as
  select pp.id, pp.user_id, pp.country_id, pp.from_date, pp.to_date, pp.kind, pp.body, pp.created_at,
         p.display_name as author
  from public.partner_posts pp
  left join public.profiles p on p.id = pp.user_id
  where not pp.hidden;

/* ───────────── private replies ───────────── */

create table public.partner_replies (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.partner_posts (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 2 and 400),
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);

create index partner_replies_post_idx on public.partner_replies (post_id);

alter table public.partner_replies enable row level security;

-- True when the signed-in user wrote the post. security definer so the check does not depend on
-- whether the post is still visible on the board.
create function public.owns_partner_post(p_post uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.partner_posts where id = p_post and user_id = auth.uid());
$$;

revoke all on function public.owns_partner_post(uuid) from public, anon;
grant execute on function public.owns_partner_post(uuid) to authenticated;

create policy "author and replier read a reply"
  on public.partner_replies for select to authenticated
  using (user_id = (select auth.uid()) or public.owns_partner_post(post_id));

-- The subquery runs under the caller's policies, so only posts on the board can be answered.
create policy "users reply to other people's current posts"
  on public.partner_replies for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and not public.owns_partner_post(post_id)
    and exists (select 1 from public.partner_posts pp where pp.id = post_id and not pp.hidden and pp.to_date >= current_date)
  );

create policy "author or replier delete a reply"
  on public.partner_replies for delete to authenticated
  using (user_id = (select auth.uid()) or public.owns_partner_post(post_id));

-- At most 30 replies a day per user.
create function public.partner_replies_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.partner_replies
        where user_id = new.user_id and created_at > now() - interval '1 day') >= 30 then
    raise exception 'partner reply rate limit reached' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger partner_replies_limit_trg before insert on public.partner_replies
  for each row execute function public.partner_replies_limit();

create view public.partner_replies_public with (security_invoker = true) as
  select r.id, r.post_id, r.user_id, r.body, r.created_at, p.display_name as author
  from public.partner_replies r
  left join public.profiles p on p.id = r.user_id;

/* ───────────── reports ───────────── */

create table public.partner_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.partner_posts (id) on delete cascade,
  reporter_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reason text not null default '' check (char_length(reason) <= 500),
  created_at timestamptz not null default now(),
  unique (post_id, reporter_id)
);

alter table public.partner_reports enable row level security;

create policy "users file their own partner reports"
  on public.partner_reports for insert to authenticated
  with check (reporter_id = (select auth.uid()));
-- No select policy: reports are readable only from the Supabase dashboard.

create function public.partner_reports_auto_hide() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(distinct reporter_id) from public.partner_reports where post_id = new.post_id) >= 3 then
    update public.partner_posts set hidden = true where id = new.post_id;
  end if;
  return new;
end $$;

create trigger partner_reports_auto_hide_trg after insert on public.partner_reports
  for each row execute function public.partner_reports_auto_hide();

/* ───────────── table privileges (defence in depth on top of RLS) ───────────── */

revoke all on public.partner_posts, public.partner_replies, public.partner_reports from anon;
revoke update on public.partner_posts, public.partner_replies, public.partner_reports from authenticated;
revoke all on public.partner_posts_public, public.partner_replies_public from anon;
grant select on public.partner_posts_public, public.partner_replies_public to authenticated;
