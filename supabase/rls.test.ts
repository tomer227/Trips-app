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
  await db.exec(readFileSync('supabase/migrations/0001_init.sql', 'utf8'));
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

describe('account deletion', () => {
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
