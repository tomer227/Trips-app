import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Runs the real migration on an in-process Postgres with a minimal stand-in for Supabase's `auth`
 * schema and roles, then checks what each kind of caller (anonymous, signed-in user A/B) can do.
 */
let db: PGlite;
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const D = '44444444-4444-4444-8444-444444444444';

const STUB = `
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb not null default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin;
  create role authenticated nologin;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  -- Supabase grants everything on new public tables to these roles and relies on RLS.
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
`;

async function as<T = Record<string, unknown>>(uid: string | null, sql: string, params?: unknown[]): Promise<T[]> {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false); set role ${uid ? 'authenticated' : 'anon'};`);
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec('reset role');
  }
}

const addUser = (id: string, name: string | null) =>
  db.query('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)', [id, `${id.slice(0, 4)}@example.com`, JSON.stringify(name === null ? {} : { display_name: name })]);

const review = (place: string, over: Record<string, unknown> = {}) => ({ place_id: place, stars: 4, body: 'טוב', visited: '2026-01', tags: ['safe-alone'], ...over });
const insertReview = (uid: string | null, r: ReturnType<typeof review> & Record<string, unknown>) =>
  as(uid, 'insert into public.reviews (place_id, stars, body, visited, tags) values ($1,$2,$3,$4,$5) returning id', [r.place_id, r.stars, r.body, r.visited, r.tags]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(STUB);
  // The exact file users paste into the Supabase SQL Editor (all migrations in order).
  await db.exec(readFileSync('supabase/setup_all.sql', 'utf8'));
  await addUser(A, 'דנה');
  await addUser(B, 'יוסי');
  await addUser(C, null);
  await addUser(D, 'x'); // too short → falls back to a generated name
});

afterAll(async () => {
  await db.close();
});

describe('profiles', () => {
  it('are created by the signup trigger, with a fallback name when the requested one is invalid', async () => {
    const rows = await as<{ id: string; display_name: string }>(null, 'select id, display_name from public.profiles order by display_name');
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.display_name]));
    expect(byId[A]).toBe('דנה');
    expect(byId[C]).toMatch(/^מטייל /);
    expect(byId[D]).toMatch(/^מטייל /);
  });

  it('can be edited only by their owner, within the length limits', async () => {
    await as(A, 'update public.profiles set display_name = $1 where id = $2', ['דנה הטיילת', A]);
    const own = await as<{ display_name: string }>(null, 'select display_name from public.profiles where id = $1', [A]);
    expect(own[0].display_name).toBe('דנה הטיילת');

    await as(A, 'update public.profiles set display_name = $1 where id = $2', ['hacked', B]); // silently matches no rows
    expect((await as<{ display_name: string }>(null, 'select display_name from public.profiles where id = $1', [B]))[0].display_name).toBe('יוסי');

    await expect(as(A, 'update public.profiles set display_name = $1 where id = $2', ['x', A])).rejects.toThrow(/check constraint/);
    await expect(as(A, "update public.profiles set display_name = repeat('א', 31) where id = $1", [A])).rejects.toThrow(/check constraint/);
    await expect(as(null, 'update public.profiles set display_name = $1 where id = $2', ['anon', A])).rejects.toThrow(/permission denied/);
    await expect(as(A, 'insert into public.profiles (id, display_name) values (gen_random_uuid(), $1)', ['fake'])).rejects.toThrow(/row-level security/);
  });
});

describe('user_data (private sync)', () => {
  it('is readable and writable only by its owner', async () => {
    await as(A, 'insert into public.user_data (user_id, data) values ($1, $2)', [A, JSON.stringify({ v: 1, keys: { journal: { at: 't', value: 'secret' } } })]);

    expect((await as(A, 'select * from public.user_data')).length).toBe(1);
    expect(await as(B, 'select * from public.user_data')).toEqual([]);
    await expect(as(null, 'select * from public.user_data')).rejects.toThrow(/permission denied/);

    // B cannot write as A, change A's row, or delete it.
    await expect(as(B, 'insert into public.user_data (user_id, data) values ($1, $2)', [A, '{}'])).rejects.toThrow(/row-level security|duplicate key/);
    await as(B, "update public.user_data set data = '{}' where user_id = $1", [A]);
    await as(B, 'delete from public.user_data where user_id = $1', [A]);
    const still = await as<{ data: { keys: { journal: { value: string } } } }>(A, 'select data from public.user_data');
    expect(still[0].data.keys.journal.value).toBe('secret');
  });

  it('cannot be moved to another owner and is size-limited', async () => {
    await expect(as(A, 'update public.user_data set user_id = $1 where user_id = $2', [B, A])).rejects.toThrow(/row-level security/);
    await expect(as(B, "insert into public.user_data (user_id, data) values ($1, jsonb_build_object('x', repeat('a', 2100000)))", [B])).rejects.toThrow(/check constraint/);
  });
});

describe('reviews', () => {
  it('are public to read but only writable by signed-in users as themselves', async () => {
    await insertReview(A, review('kasol'));
    expect((await as(null, "select * from public.reviews where place_id = 'kasol'")).length).toBe(1);

    await expect(insertReview(null, review('kasol'))).rejects.toThrow(/permission denied/);
    await expect(as(B, 'insert into public.reviews (user_id, place_id, stars, visited) values ($1, $2, 4, $3)', [A, 'cusco', '2026-01'])).rejects.toThrow(/row-level security/);
  });

  it('shows the author name through the public view', async () => {
    const rows = await as<{ author: string; user_id: string }>(null, "select author, user_id from public.reviews_public where place_id = 'kasol'");
    expect(rows).toHaveLength(1);
    expect(rows[0].author).toBe('דנה הטיילת');
  });

  it('allow one review per user and place, and enforce field rules', async () => {
    await expect(insertReview(A, review('kasol'))).rejects.toThrow(/duplicate key/);
    await expect(insertReview(B, review('x1', { stars: 0 }))).rejects.toThrow(/check constraint/);
    await expect(insertReview(B, review('x2', { stars: 6 }))).rejects.toThrow(/check constraint/);
    await expect(insertReview(B, review('x3', { visited: '2026-13' }))).rejects.toThrow(/check constraint/);
    await expect(insertReview(B, review('x4', { visited: 'last week' }))).rejects.toThrow(/check constraint/);
    await expect(insertReview(B, review('x5', { tags: ['hacker'] }))).rejects.toThrow(/check constraint/);
    await expect(insertReview(B, review('x6', { body: 'א'.repeat(2001) }))).rejects.toThrow(/check constraint/);
    await expect(as(B, "insert into public.reviews (place_id, stars, visited, cost_usd) values ('x7', 4, '2026-01', -5)")).rejects.toThrow(/check constraint/);
    await expect(insertReview(B, review('x8', { tags: Array(9).fill('vibe') }))).rejects.toThrow(/check constraint/);
  });

  it('can be edited or deleted only by their author', async () => {
    const [{ id }] = await as<{ id: string }>(A, "select id from public.reviews where place_id = 'kasol'");
    await as(B, "update public.reviews set body = 'vandalised' where id = $1", [id]);
    await as(B, 'delete from public.reviews where id = $1', [id]);
    expect((await as<{ body: string }>(null, 'select body from public.reviews where id = $1', [id]))[0].body).toBe('טוב');

    await as(A, "update public.reviews set body = 'עודכן', stars = 5 where id = $1", [id]);
    expect((await as<{ body: string; stars: number }>(null, 'select body, stars from public.reviews where id = $1', [id]))[0]).toMatchObject({ body: 'עודכן', stars: 5 });
  });

  it('cannot change authorship or moderation state through an edit', async () => {
    const [{ id }] = await as<{ id: string }>(A, "select id from public.reviews where place_id = 'kasol'");
    await as(A, 'update public.reviews set hidden = true where id = $1', [id]);
    await as(A, 'update public.reviews set user_id = $1 where id = $2', [B, id]); // ignored: authorship is fixed
    const row = await as<{ hidden: boolean; user_id: string }>(null, 'select hidden, user_id from public.reviews where id = $1', [id]);
    expect(row[0]).toEqual({ hidden: false, user_id: A });
    await expect(as(B, 'insert into public.reviews (place_id, stars, visited, hidden) values ($1, 4, $2, true)', ['sneaky', '2026-01'])).rejects.toThrow(/row-level security/);
  });

  it('are limited to 30 new reviews per user per day', async () => {
    for (let i = 0; i < 30; i++) await insertReview(C, review(`bulk-${i}`));
    await expect(insertReview(C, review('bulk-30'))).rejects.toThrow(/rate limit/);
    await insertReview(B, review('bulk-other')); // other users are unaffected
  });
});

describe('reports and moderation', () => {
  it('can be filed once per user, are unreadable through the API, and hide a review after three reporters', async () => {
    const [{ id }] = await as<{ id: string }>(A, "select id from public.reviews where place_id = 'kasol'");
    await as(B, "insert into public.reports (review_id, reason) values ($1, 'spam')", [id]);
    await expect(as(B, "insert into public.reports (review_id, reason) values ($1, 'again')", [id])).rejects.toThrow(/duplicate key/);
    await expect(as(B, 'insert into public.reports (review_id, reporter_id) values ($1, $2)', [id, C])).rejects.toThrow(/row-level security/);
    await expect(as(null, "insert into public.reports (review_id) values ($1)", [id])).rejects.toThrow(/permission denied/);

    expect(await as(B, 'select * from public.reports')).toEqual([]);
    await expect(as(null, 'select * from public.reports')).rejects.toThrow(/permission denied/);

    // Two reporters: still visible. Three: hidden from everyone but its author.
    await as(C, "insert into public.reports (review_id) values ($1)", [id]);
    expect((await as(null, 'select * from public.reviews_public where id = $1', [id])).length).toBe(1);
    await as(D, "insert into public.reports (review_id) values ($1)", [id]);
    expect(await as(null, 'select * from public.reviews_public where id = $1', [id])).toEqual([]);
    expect(await as(B, 'select * from public.reviews where id = $1', [id])).toEqual([]);
    expect((await as(A, 'select * from public.reviews where id = $1', [id])).length).toBe(1);
  });
});

describe('who else is there', () => {
  const trip = (...w: [string, string, string][]) => JSON.stringify(w.map(([country_id, from_date, to_date]) => ({ country_id, from_date, to_date })));
  // Relative dates: set_my_trip only accepts trips up to two years ahead.
  const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  type Row = { display_name: string; country_id: string };

  it('shows overlapping travellers only to those who share, and hides the raw table', async () => {
    await as(A, 'select public.set_my_trip($1::jsonb)', [trip(['peru', day(30), day(60)])]);
    expect(await as(C, 'select * from public.who_else_there()')).toEqual([]); // C shares nothing

    await as(C, 'select public.set_my_trip($1::jsonb)', [trip(['peru', day(49), day(70)], ['chile', day(30), day(60)])]);
    const seen = await as<Row>(C, 'select display_name, country_id from public.who_else_there()');
    expect(seen).toEqual([{ display_name: 'דנה הטיילת', country_id: 'peru' }]);
    expect((await as<Row>(A, 'select display_name, country_id from public.who_else_there()')).map((r) => r.country_id)).toEqual(['peru']);

    await expect(as(A, 'select * from public.trip_windows')).rejects.toThrow(/permission denied/);
    await expect(as(null, 'select * from public.who_else_there()')).rejects.toThrow(/permission denied/);
    await expect(as(null, 'select public.set_my_trip($1::jsonb)', ['[]'])).rejects.toThrow(/permission denied/);
  });

  it('rejects bad trips, ignores past ones and stops sharing on an empty trip', async () => {
    await expect(as(A, 'select public.set_my_trip($1::jsonb)', [trip(['peru', day(61), day(30)])])).rejects.toThrow(/check constraint/);
    await expect(as(A, 'select public.set_my_trip($1::jsonb)', [trip(['<script>', day(30), day(31)])])).rejects.toThrow(/check constraint/);
    await as(D, 'select public.set_my_trip($1::jsonb)', [trip(['peru', '2000-01-01', '2000-01-31'])]);
    await as(D, 'select public.set_my_trip($1::jsonb)', [trip(['peru', day(30), day(60)], ['peru', '2000-01-01', '2000-01-31'])]);
    expect((await as<Row>(C, 'select display_name, country_id from public.who_else_there()')).length).toBe(2); // A and D, not D's past trip

    await as(A, 'select public.set_my_trip($1::jsonb)', ['[]']);
    expect((await as<Row>(C, 'select display_name from public.who_else_there()')).map((r) => r.display_name)).not.toContain('דנה הטיילת');
  });
});

describe('partner board', () => {
  const post = (uid: string | null, over: Partial<Record<'country' | 'from' | 'to' | 'kind' | 'body', string>> = {}) =>
    as<{ id: string }>(uid, 'insert into public.partner_posts (country_id, from_date, to_date, kind, body) values ($1,$2,$3,$4,$5) returning id', [
      over.country ?? 'peru',
      over.from ?? '2099-03-01',
      over.to ?? '2099-03-10',
      over.kind ?? 'trek',
      over.body ?? 'מחפשים שותפים לטרק סלקנטאי',
    ]);
  const reply = (uid: string | null, postId: string, body = 'גם אני! וואטסאפ 050-0000000') =>
    as(uid, 'insert into public.partner_replies (post_id, body) values ($1,$2) returning id', [postId, body]);

  it('shows current posts to signed-in users only, with the author name and no email', async () => {
    const [{ id }] = await post(A);
    const rows = await as<Record<string, unknown>>(B, 'select * from public.partner_posts_public where id = $1', [id]);
    expect(rows).toHaveLength(1);
    expect(rows[0].author).toBe('דנה הטיילת');
    expect(Object.keys(rows[0])).not.toContain('email');
    await expect(as(null, 'select * from public.partner_posts_public')).rejects.toThrow(/permission denied/);
    await expect(as(null, 'select * from public.partner_posts')).rejects.toThrow(/permission denied/);
    await expect(post(null)).rejects.toThrow(/permission denied/);
  });

  it('keeps replies between the post author and the replier', async () => {
    const [{ id }] = await post(A, { kind: 'ride', body: 'חולקים ג׳יפ לאויוני' });
    await reply(B, id);
    await expect(reply(B, id, 'שוב')).rejects.toThrow(/duplicate key/);
    await expect(reply(A, id, 'עונה לעצמי')).rejects.toThrow(/row-level security/);

    const read = (uid: string) => as<{ author: string; body: string }>(uid, 'select author, body from public.partner_replies_public where post_id = $1', [id]);
    expect((await read(A)).map((r) => r.author)).toEqual(['יוסי']);
    expect(await read(B)).toHaveLength(1);
    expect(await read(D)).toEqual([]); // a third user sees nothing
    await expect(as(null, 'select * from public.partner_replies')).rejects.toThrow(/permission denied/);

    // Nobody edits a reply; the post author can delete it.
    await expect(as(B, "update public.partner_replies set body = 'x' where post_id = $1", [id])).rejects.toThrow(/permission denied/);
    await as(A, 'delete from public.partner_replies where post_id = $1', [id]);
    expect(await read(B)).toEqual([]);
  });

  it('hides past posts, blocks replies to them and rejects bad posts', async () => {
    const [{ id: old }] = await post(B, { from: '2000-01-01', to: '2000-01-05' });
    expect(await as(A, 'select id from public.partner_posts_public where id = $1', [old])).toEqual([]);
    expect(await as(B, 'select id from public.partner_posts_public where id = $1', [old])).toHaveLength(1); // the author still sees it
    await expect(reply(A, old)).rejects.toThrow(/row-level security/);

    await expect(post(A, { kind: 'party' })).rejects.toThrow(/check constraint/);
    await expect(post(A, { body: 'קצר' })).rejects.toThrow(/check constraint/);
    await expect(post(A, { from: '2099-05-01', to: '2099-04-01' })).rejects.toThrow(/check constraint/);
    await expect(post(A, { country: '<b>' })).rejects.toThrow(/check constraint/);
    await expect(as(A, "update public.partner_posts set body = 'מחפשים שותפים אחרים' where user_id = $1", [A])).rejects.toThrow(/permission denied/);
    await expect(as(A, 'insert into public.partner_posts (user_id, country_id, from_date, to_date, kind, body) values ($1,$2,$3,$4,$5,$6)', [B, 'peru', '2099-01-01', '2099-01-02', 'trek', 'מתחזה למישהו אחר'])).rejects.toThrow(/row-level security/);
  });

  it('limits current posts per user and lets only the author delete', async () => {
    const mine = await as<{ c: number }>(C, 'select count(*)::int as c from public.partner_posts where user_id = $1', [C]);
    for (let i = mine[0].c; i < 5; i++) await post(C, { body: `מודעה מספר ${i} לבדיקה` });
    await expect(post(C)).rejects.toThrow(/limit reached/);

    const [{ id }] = await as<{ id: string }>(C, 'select id from public.partner_posts where user_id = $1 limit 1', [C]);
    await as(A, 'delete from public.partner_posts where id = $1', [id]);
    expect(await as(C, 'select id from public.partner_posts where id = $1', [id])).toHaveLength(1);
    await as(C, 'delete from public.partner_posts where id = $1', [id]);
    expect(await as(C, 'select id from public.partner_posts where id = $1', [id])).toEqual([]);
  });

  it('hides a post after three different reporters, and keeps reports unreadable', async () => {
    const [{ id }] = await post(D, { kind: 'hangout', body: 'מי בא למסיבה בקוסקו?' });
    for (const uid of [A, B, A]) await as(uid, 'insert into public.partner_reports (post_id, reason) values ($1, $2) on conflict do nothing', [id, 'spam']);
    expect(await as(C, 'select id from public.partner_posts_public where id = $1', [id])).toHaveLength(1);
    await as(C, 'insert into public.partner_reports (post_id, reason) values ($1, $2)', [id, 'spam']);
    expect(await as(B, 'select id from public.partner_posts_public where id = $1', [id])).toEqual([]);
    expect(await as(A, 'select * from public.partner_reports')).toEqual([]); // no select policy
    await expect(as(D, "update public.partner_posts set hidden = false where id = $1", [id])).rejects.toThrow(/permission denied/);
  });
});

describe('hardening (0004)', () => {
  const E = '55555555-5555-4555-8555-555555555555';
  const F = '66666666-6666-4666-8666-666666666666';
  const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  const trip = (...w: [string, string, string][]) => JSON.stringify(w.map(([country_id, from_date, to_date]) => ({ country_id, from_date, to_date })));

  beforeAll(async () => {
    await addUser(E, 'אלה');
    await addUser(F, 'פלג');
  });

  it('ignores a created_at sent by the client, so daily limits cannot be dodged', async () => {
    const [{ id }] = await as<{ id: string }>(E, "insert into public.reviews (place_id, stars, visited, created_at) values ('hard-1', 5, '2026-01', '2000-01-01') returning id");
    const [{ recent }] = (await db.query<{ recent: boolean }>("select created_at > now() - interval '1 minute' as recent from public.reviews where id = $1", [id])).rows;
    expect(recent).toBe(true);
    const [{ id: postId }] = await as<{ id: string }>(E, "insert into public.partner_posts (country_id, from_date, to_date, kind, body, created_at) values ('peru', $1, $2, 'trek', 'מחפשת שותפה לטרק', '2000-01-01') returning id", [day(10), day(20)]);
    const posts = await db.query<{ recent: boolean }>("select created_at > now() - interval '1 minute' as recent from public.partner_posts where id = $1", [postId]);
    expect(posts.rows[0].recent).toBe(true);
  });

  it('allows at most 20 reports a day per user', async () => {
    for (let n = 0; n < 21; n++) await as(F, "insert into public.reviews (place_id, stars, visited) values ($1, 4, '2026-01')", [`hard-r${n}`]);
    const ids = (await db.query<{ id: string }>('select id from public.reviews where user_id = $1 order by place_id', [F])).rows.map((r) => r.id);
    for (const id of ids.slice(0, 20)) await as(E, 'insert into public.reports (review_id) values ($1)', [id]);
    await expect(as(E, 'insert into public.reports (review_id) values ($1)', [ids[20]])).rejects.toThrow(/report rate limit/);
  });

  it('limits shared trips so they cannot be used to list everyone', async () => {
    const many = Array.from({ length: 16 }, (_, n) => ['peru', day(n * 2 + 1), day(n * 2 + 2)] as [string, string, string]);
    await expect(as(E, 'select public.set_my_trip($1::jsonb)', [trip(...many)])).rejects.toThrow(/too many trip stops/);
    await expect(as(E, 'select public.set_my_trip($1::jsonb)', [trip(['peru', day(1), day(200)], ['chile', day(1), day(250)])])).rejects.toThrow(/trip too long/);
    await expect(as(E, 'select public.set_my_trip($1::jsonb)', [trip(['peru', day(800), day(810)])])).rejects.toThrow(/too far ahead/);

    // Saving the same trip again (the app does it on every visit) is not a change.
    for (let n = 0; n < 35; n++) await as(E, 'select public.set_my_trip($1::jsonb)', [trip(['peru', day(5), day(25)])]);
    // Real changes are capped at 30 a day (one was used above).
    let failed = 0;
    for (let n = 0; n < 31; n++) {
      try {
        await as(E, 'select public.set_my_trip($1::jsonb)', [trip(['peru', day(5), day(26 + n)])]);
      } catch (e) {
        expect(String(e)).toMatch(/trip change rate limit/);
        failed++;
      }
    }
    expect(failed).toBe(2);
    await expect(as(E, 'select * from public.trip_changes')).rejects.toThrow(/permission denied/);
  });

  it('does not expose trigger functions through the API', async () => {
    await expect(as(E, 'select public.reviews_rate_limit()')).rejects.toThrow(/permission denied/);
    await expect(as(null, 'select public.force_created_now()')).rejects.toThrow(/permission denied/);
  });
});

describe('moderation (0005)', () => {
  const G = '77777777-7777-4777-8777-777777777777';
  const M = '88888888-8888-4888-8888-888888888888';
  type Q = { kind: string; id: string; body: string; author: string; hidden: boolean; reports: string; reasons: string[] };

  beforeAll(async () => {
    await addUser(G, 'גיל');
    await addUser(M, 'מודה');
    await db.query('insert into public.moderators (user_id) values ($1)', [M]);
  });

  it('is closed to everyone who is not a moderator', async () => {
    expect((await as<{ m: boolean }>(G, 'select public.is_moderator() as m'))[0].m).toBe(false);
    expect((await as<{ m: boolean }>(M, 'select public.is_moderator() as m'))[0].m).toBe(true);
    await expect(as(G, 'select * from public.mod_queue()')).rejects.toThrow(/not a moderator/);
    await expect(as(null, 'select * from public.mod_queue()')).rejects.toThrow(/permission denied/);
    await expect(as(G, "select public.mod_act('review', gen_random_uuid(), 'delete')")).rejects.toThrow(/not a moderator/);
    await expect(as(G, 'select * from public.moderators')).rejects.toThrow(/permission denied/);
    await expect(as(G, 'insert into public.moderators (user_id) values ($1)', [G])).rejects.toThrow(/permission denied/);
  });

  it('shows reported content with reasons, and restores, hides or deletes it', async () => {
    const [{ id }] = await as<{ id: string }>(G, "insert into public.reviews (place_id, stars, body, visited) values ('mod-1', 1, 'ספאם ספאם', '2026-01') returning id");
    for (const [uid, reason] of [[A, 'spam'], [C, ''], [D, 'פרסומת']] as const) await as(uid, 'insert into public.reports (review_id, reason) values ($1, $2)', [id, reason]);
    const queue = await as<Q>(M, 'select * from public.mod_queue()');
    const row = queue.find((q) => q.id === id)!;
    expect(row).toMatchObject({ kind: 'review', body: 'ספאם ספאם', author: 'גיל', hidden: true });
    expect(Number(row.reports)).toBe(3);
    expect(row.reasons.sort()).toEqual(['spam', 'פרסומת'].sort());

    await as(M, "select public.mod_act('review', $1, 'restore')", [id]);
    expect(await as(B, 'select id from public.reviews_public where id = $1', [id])).toHaveLength(1);
    expect((await as<Q>(M, 'select * from public.mod_queue()')).some((q) => q.id === id)).toBe(false);

    await as(M, "select public.mod_act('review', $1, 'hide')", [id]);
    expect(await as(B, 'select id from public.reviews_public where id = $1', [id])).toEqual([]);
    await as(M, "select public.mod_act('review', $1, 'delete')", [id]);
    expect((await db.query('select 1 from public.reviews where id = $1', [id])).rows).toEqual([]);
    await expect(as(M, "select public.mod_act('review', $1, 'nuke')", [id])).rejects.toThrow(/invalid action/);
  });
});

describe('meetups (0006)', () => {
  const H = '99999999-9999-4999-8999-999999999999';
  const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
  const meetup = (uid: string | null, over: Partial<Record<'title' | 'place' | 'starts' | 'country', string>> = {}) =>
    as<{ id: string }>(uid, 'insert into public.meetups (country_id, title, place_label, lat, lng, starts_at) values ($1,$2,$3,$4,$5,$6) returning id', [
      over.country ?? 'peru',
      over.title ?? 'ארוחת שישי',
      over.place ?? 'בית חב״ד קוסקו',
      -13.516,
      -71.978,
      over.starts ?? inHours(30),
    ]);
  type Row = { id: string; author: string; going: string; i_am_going: boolean };

  beforeAll(async () => {
    await addUser(H, 'הדר');
  });

  it('shows upcoming meetups to signed-in users with a head count but not who is coming', async () => {
    const [{ id }] = await meetup(H);
    await as(A, 'insert into public.meetup_going (meetup_id) values ($1)', [id]);
    await as(C, 'insert into public.meetup_going (meetup_id) values ($1)', [id]);
    const [row] = await as<Row>(A, 'select id, author, going, i_am_going from public.meetups_public where id = $1', [id]);
    expect(row).toMatchObject({ author: 'הדר', i_am_going: true });
    expect(Number(row.going)).toBe(2);
    expect((await as<Row>(D, 'select i_am_going from public.meetups_public where id = $1', [id]))[0].i_am_going).toBe(false);
    expect(await as(D, 'select * from public.meetup_going where meetup_id = $1', [id])).toEqual([]); // others' rows are private
    await expect(as(null, 'select * from public.meetups_public')).rejects.toThrow(/permission denied/);
    await expect(as(A, "update public.meetups set title = 'x' where id = $1", [id])).rejects.toThrow(/permission denied/);

    await as(A, 'delete from public.meetup_going where meetup_id = $1', [id]);
    expect(Number((await as<Row>(D, 'select going from public.meetups_public where id = $1', [id]))[0].going)).toBe(1);
  });

  it('rejects bad dates, too many meetups and bad input, and hides old ones', async () => {
    await expect(meetup(H, { starts: inHours(24 * 61) })).rejects.toThrow(/date out of range/);
    await expect(meetup(H, { starts: inHours(-3) })).rejects.toThrow(/date out of range/);
    await expect(meetup(H, { title: 'א' })).rejects.toThrow(/check constraint/);
    await expect(meetup(H, { country: '<b>' })).rejects.toThrow(/check constraint/);
    await meetup(H, { title: 'טרק ליום' });
    await meetup(H, { title: 'מסיבה בחוף' });
    await expect(meetup(H, { title: 'עוד אחד' })).rejects.toThrow(/meetup limit/);

    const [{ id: old }] = await meetup(A, { title: 'ישן מדי' });
    await db.query("update public.meetups set starts_at = now() - interval '2 days' where id = $1", [old]);
    expect(await as(C, "select id from public.meetups_public where title = 'ישן מדי'")).toEqual([]);
  });

  it('hides a meetup after three reports and lets a moderator restore it', async () => {
    const [{ id }] = await as<{ id: string }>(A, "insert into public.meetups (country_id, title, place_label, lat, lng, starts_at) values ('chile', 'קפה בבוקר', 'כיכר', 1, 1, $1) returning id", [inHours(5)]);
    for (const uid of [C, D, H]) await as(uid, 'insert into public.meetup_reports (meetup_id, reason) values ($1, $2)', [id, 'spam']);
    expect(await as(C, 'select id from public.meetups_public where id = $1', [id])).toEqual([]);
    await expect(as(C, 'insert into public.meetup_going (meetup_id) values ($1)', [id])).rejects.toThrow(/row-level security/);
    await db.query("insert into public.moderators (user_id) values ($1) on conflict do nothing", [A]);
    expect((await as<{ kind: string; id: string }>(A, 'select kind, id from public.mod_queue()')).some((q) => q.kind === 'meetup' && q.id === id)).toBe(true);
    await as(A, "select public.mod_act('meetup', $1, 'restore')", [id]);
    expect(await as(C, 'select id from public.meetups_public where id = $1', [id])).toHaveLength(1);
  });
});

describe('review fixes (0007)', () => {
  const [P, Q, R, S] = ['b', 'c', 'd', 'e'].map((c) => `${c.repeat(8)}-${c.repeat(4)}-4${c.repeat(3)}-8${c.repeat(3)}-${c.repeat(12)}`);
  const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
  const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  const meetup = (uid: string, starts = inHours(30)) =>
    as<{ id: string }>(uid, "insert into public.meetups (country_id, title, place_label, lat, lng, starts_at) values ('peru', 'ארוחת שישי', 'כיכר', 1, 1, $1) returning id", [starts]);

  beforeAll(async () => {
    for (const [id, name] of [[P, 'פז'], [Q, 'קרן'], [R, 'רון'], [S, 'שי']]) await addUser(id, name);
    await db.query('insert into public.moderators (user_id) values ($1)', [S]);
  });

  it('counts daily limits from a log, so deleting and creating again does not help', async () => {
    for (let i = 0; i < 10; i++) {
      const [{ id }] = await meetup(P);
      await as(P, 'delete from public.meetups where id = $1', [id]);
    }
    await expect(meetup(P)).rejects.toThrow(/meetup rate limit/);

    for (let i = 0; i < 10; i++) {
      const [{ id }] = await as<{ id: string }>(P, "insert into public.partner_posts (country_id, from_date, to_date, kind, body) values ('peru', $1, $2, 'trek', 'מחפש שותפים לטרק') returning id", [day(5), day(9)]);
      await as(P, 'delete from public.partner_posts where id = $1', [id]);
    }
    await expect(as(P, "insert into public.partner_posts (country_id, from_date, to_date, kind, body) values ('peru', $1, $2, 'trek', 'מחפש שותפים לטרק')", [day(5), day(9)])).rejects.toThrow(/partner post rate limit/);

    for (let i = 0; i < 30; i++) {
      const [{ id }] = await insertReview(P, review(`place-${i}`)) as { id: string }[];
      await as(P, 'delete from public.reviews where id = $1', [id]);
    }
    await expect(insertReview(P, review('one-more'))).rejects.toThrow(/review rate limit/);
    await expect(as(P, 'select * from public.activity_log')).rejects.toThrow(/permission denied/);
    await expect(as(P, "select public.log_activity($1, 'meetup', 0, 'x')", [P])).rejects.toThrow(/permission denied/);
  });

  it('counts meetups that already started toward the 3 on the board', async () => {
    for (let i = 0; i < 3; i++) await meetup(Q, inHours(-0.5));
    await expect(meetup(Q)).rejects.toThrow(/meetup limit reached/);
  });

  it('does not let an organiser count themselves as coming, or count hidden meetups', async () => {
    const [{ id }] = await meetup(R);
    await expect(as(R, 'insert into public.meetup_going (meetup_id) values ($1)', [id])).rejects.toThrow(/row-level security/);
    await as(Q, 'insert into public.meetup_going (meetup_id) values ($1)', [id]);
    expect(Number((await as<{ n: string }>(P, 'select public.meetup_going_count($1) as n', [id]))[0].n)).toBe(1);
    await db.query('update public.meetups set hidden = true where id = $1', [id]);
    expect(Number((await as<{ n: string }>(P, 'select public.meetup_going_count($1) as n', [id]))[0].n)).toBe(0);
  });

  it('keeps reports after a restore, so the same accounts cannot hide it again', async () => {
    const [{ id }] = await meetup(S);
    for (const uid of [P, Q, R]) await as(uid, "insert into public.meetup_reports (meetup_id, reason) values ($1, 'spam')", [id]);
    expect((await db.query<{ hidden: boolean }>('select hidden from public.meetups where id = $1', [id])).rows[0].hidden).toBe(true);
    await as(S, "select public.mod_act('meetup', $1, 'restore')", [id]);
    expect((await as<{ id: string }>(S, 'select id from public.mod_queue() where id = $1', [id]))).toEqual([]);
    for (const uid of [P, Q, R]) await expect(as(uid, "insert into public.meetup_reports (meetup_id, reason) values ($1, 'again')", [id])).rejects.toThrow(/duplicate key/);
    expect((await db.query<{ hidden: boolean }>('select hidden from public.meetups where id = $1', [id])).rows[0].hidden).toBe(false);
    // A new report shows up in the queue on its own.
    await as(A, "insert into public.meetup_reports (meetup_id, reason) values ($1, 'new')", [id]);
    const [row] = await as<{ reports: string; reasons: string[] }>(S, 'select reports, reasons from public.mod_queue() where id = $1', [id]);
    expect(Number(row.reports)).toBe(1);
    expect(row.reasons).toEqual(['new']);
  });

  it('does not let an author move a review to another place', async () => {
    const [{ id }] = await insertReview(Q, review('kasol')) as { id: string }[];
    await as(Q, "update public.reviews set place_id = 'elsewhere', body = 'עדכון' where id = $1", [id]);
    expect((await db.query<{ place_id: string; body: string }>('select place_id, body from public.reviews where id = $1', [id])).rows[0]).toEqual({ place_id: 'kasol', body: 'עדכון' });
  });
});

describe('account deletion', () => {
  it('removes a user who has data in every table, without touching anyone else', async () => {
    const Z = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    await addUser(Z, 'נמחק');
    await db.query('insert into public.moderators (user_id) values ($1)', [Z]);
    const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
    const soon = new Date(Date.now() + 5 * 3_600_000).toISOString();

    await as(Z, "insert into public.user_data (user_id, data) values ($1, '{}'::jsonb)", [Z]);
    const [{ id: reviewId }] = await insertReview(Z, review('kasol')) as { id: string }[];
    await as(Z, 'select public.set_my_trip($1::jsonb)', [JSON.stringify([{ country_id: 'peru', from_date: day(10), to_date: day(20) }])]);
    const [{ id: postId }] = await as<{ id: string }>(Z, "insert into public.partner_posts (country_id, from_date, to_date, kind, body) values ('peru', $1, $2, 'trek', 'מחפש שותפים לטרק') returning id", [day(10), day(20)]);
    const [{ id: meetupId }] = await as<{ id: string }>(Z, "insert into public.meetups (country_id, title, place_label, lat, lng, starts_at) values ('peru', 'ארוחת שישי', 'כיכר', 1, 1, $1) returning id", [soon]);
    // Others interact with Z's content, and Z with theirs.
    const [{ id: othersPost }] = await as<{ id: string }>(A, "insert into public.partner_posts (country_id, from_date, to_date, kind, body) values ('chile', $1, $2, 'trek', 'מחפשת שותפה לטרק') returning id", [day(10), day(20)]);
    await as(Z, "insert into public.partner_replies (post_id, body) values ($1, 'אני בפנים!')", [othersPost]);
    await as(Z, "insert into public.partner_reports (post_id, reason) values ($1, 'spam')", [othersPost]);
    await as(A, "insert into public.partner_replies (post_id, body) values ($1, 'גם אני')", [postId]);
    await as(A, 'insert into public.meetup_going (meetup_id) values ($1)', [meetupId]);
    await as(A, "insert into public.reports (review_id, reason) values ($1, 'spam')", [reviewId]);

    await as(Z, 'select public.delete_my_account()');

    for (const table of ['user_data', 'reviews', 'trip_windows', 'partner_posts', 'meetups', 'meetup_going', 'partner_replies', 'partner_reports', 'trip_changes', 'activity_log']) {
      const col = table === 'partner_reports' ? 'reporter_id' : 'user_id';
      expect((await db.query(`select 1 from public.${table} where ${col} = $1`, [Z])).rows, table).toEqual([]);
    }
    expect((await db.query('select 1 from public.moderators where user_id = $1', [Z])).rows).toEqual([]);
    expect((await db.query('select 1 from public.profiles where id = $1', [Z])).rows).toEqual([]);
    expect((await db.query('select 1 from public.partner_posts where id = $1', [othersPost])).rows).toHaveLength(1);
  });

  it('lets a user delete their account and everything attached, and nobody else', async () => {
    await expect(as(null, 'select public.delete_my_account()')).rejects.toThrow(/permission denied/);

    await as(B, 'select public.delete_my_account()');
    const users = await db.query<{ id: string }>('select id from auth.users where id = $1', [B]);
    expect(users.rows).toEqual([]);
    expect((await db.query('select 1 from public.profiles where id = $1', [B])).rows).toEqual([]);
    expect((await db.query('select 1 from public.reviews where user_id = $1', [B])).rows).toEqual([]);
    // Others are untouched.
    expect((await db.query('select 1 from public.profiles where id = $1', [A])).rows.length).toBe(1);
    expect((await db.query('select 1 from public.user_data where user_id = $1', [A])).rows.length).toBe(1);
  });
});
