import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { CloudError } from './types';
import { createSupabaseBackend, mapSupabaseError, rowToReview } from './supabaseBackend';

type Result = { data?: unknown; error?: { code?: string; message?: string } | null };

/** A tiny stand-in for the supabase-js client that records calls and returns scripted results. */
function fakeClient(opts: { results?: Record<string, Result>; auth?: Record<string, unknown> } = {}) {
  const calls: { table: string; ops: [string, unknown[]][] }[] = [];
  const authListeners: ((event: string, session: unknown) => void)[] = [];
  const from = (table: string) => {
    const entry = { table, ops: [] as [string, unknown[]][] };
    calls.push(entry);
    const builder: Record<string, unknown> = {};
    for (const op of ['select', 'eq', 'order', 'limit', 'upsert', 'insert', 'update', 'delete', 'maybeSingle', 'single']) {
      builder[op] = (...args: unknown[]) => {
        entry.ops.push([op, args]);
        return builder;
      };
    }
    // Awaiting the builder yields the scripted result for "<table>.<first write/read op>".
    builder.then = (resolve: (r: Result) => unknown) => {
      const main = entry.ops.find(([op]) => ['upsert', 'insert', 'update', 'delete', 'select'].includes(op))?.[0] ?? 'select';
      return Promise.resolve(opts.results?.[`${table}.${main}`] ?? { data: null, error: null }).then(resolve);
    };
    return builder;
  };
  const rpc = vi.fn(async () => opts.results?.rpc ?? { data: null, error: null });
  const client = {
    from,
    rpc,
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { user: { id: 'u1', email: 'a@b.co', user_metadata: { display_name: 'דנה' } } } }, error: null })),
      signUp: vi.fn(async () => ({ data: { user: { id: 'u1', identities: [{}] }, session: null }, error: null })),
      signInWithPassword: vi.fn(async () => ({ data: { user: { id: 'u1', email: 'a@b.co', user_metadata: { display_name: 'דנה' } } }, error: null })),
      signOut: vi.fn(async () => ({ error: null })),
      resetPasswordForEmail: vi.fn(async () => ({ error: null })),
      updateUser: vi.fn(async () => ({ data: { user: { id: 'u1', email: 'a@b.co', user_metadata: { display_name: 'חדש' } } }, error: null })),
      onAuthStateChange: vi.fn((cb: (event: string, session: unknown) => void) => {
        authListeners.push(cb);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      ...opts.auth,
    },
  };
  return { client: client as unknown as SupabaseClient, raw: client, calls, authListeners };
}

const REDIRECT = () => 'https://app.example/trips/';
const writeOp = (calls: ReturnType<typeof fakeClient>['calls'], table: string, op: string) => calls.find((c) => c.table === table)?.ops.find(([o]) => o === op)?.[1];

describe('mapSupabaseError', () => {
  it.each([
    [{ code: 'invalid_credentials' }, 'invalid_credentials'],
    [{ message: 'Invalid login credentials' }, 'invalid_credentials'],
    [{ code: 'user_already_exists' }, 'email_taken'],
    [{ code: 'weak_password' }, 'weak_password'],
    [{ code: 'email_not_confirmed' }, 'email_not_confirmed'],
    [{ code: 'over_email_send_rate_limit' }, 'rate_limited'],
    [{ status: 429 }, 'rate_limited'],
    [{ name: 'AuthRetryableFetchError', message: 'Failed to fetch' }, 'network'],
    [{ code: '42501', message: 'new row violates row-level security policy' }, 'not_signed_in'],
    [{ code: 'PGRST301', message: 'JWT expired' }, 'not_signed_in'],
    [{ code: 'P0001', message: 'review rate limit reached' }, 'rate_limited'],
    [{ code: 'weird', message: 'something' }, 'unknown'],
    [null, 'unknown'],
  ])('maps %j to %s', (input, code) => {
    expect(mapSupabaseError(input).code).toBe(code);
  });

  it('passes CloudErrors through', () => {
    const e = new CloudError('invalid_name');
    expect(mapSupabaseError(e)).toBe(e);
  });
});

describe('rowToReview', () => {
  it('maps database rows, including numeric strings and missing authors', () => {
    const r = rowToReview({ id: 'r', place_id: 'kasol', user_id: 'u', stars: 5, body: 'יפה', visited: '2026-01', cost_usd: '12.50', tags: null, created_at: '2026-01-02T00:00:00Z', author: null });
    expect(r).toMatchObject({ id: 'r', placeId: 'kasol', text: 'יפה', costUsd: 12.5, tags: [], author: 'מטייל' });
    expect(r.createdAt).toBe(Date.parse('2026-01-02T00:00:00Z'));
    expect(rowToReview({ ...{ id: 'r', place_id: 'p', user_id: 'u', stars: 3, body: '', visited: '2026-01', created_at: 'x', author: 'x' }, cost_usd: 0, tags: [] }).costUsd).toBeUndefined();
  });
});

describe('auth', () => {
  it('validates before calling the service, and sends the display name and redirect on sign-up', async () => {
    const { client, raw } = fakeClient();
    const b = createSupabaseBackend(client, REDIRECT);
    await expect(b.signUp({ email: 'bad', password: 'password123', displayName: 'דנה' })).rejects.toMatchObject({ code: 'invalid_email' });
    await expect(b.signUp({ email: 'a@b.co', password: 'short', displayName: 'דנה' })).rejects.toMatchObject({ code: 'weak_password' });
    await expect(b.signUp({ email: 'a@b.co', password: 'password123', displayName: '' })).rejects.toMatchObject({ code: 'invalid_name' });
    expect(raw.auth.signUp).not.toHaveBeenCalled();

    const res = await b.signUp({ email: ' a@b.co ', password: 'password123', displayName: ' דנה ' });
    expect(res.needsConfirmation).toBe(true);
    expect(raw.auth.signUp).toHaveBeenCalledWith({ email: 'a@b.co', password: 'password123', options: { data: { display_name: 'דנה' }, emailRedirectTo: 'https://app.example/trips/' } });
  });

  it('reports an already-registered address (a user with no identities) as email_taken', async () => {
    const { client } = fakeClient({ auth: { signUp: vi.fn(async () => ({ data: { user: { id: 'u', identities: [] }, session: null }, error: null })) } });
    await expect(createSupabaseBackend(client, REDIRECT).signUp({ email: 'a@b.co', password: 'password123', displayName: 'דנה' })).rejects.toMatchObject({ code: 'email_taken' });
  });

  it('signs in, maps errors, and reads the stored session without a network round trip', async () => {
    const good = createSupabaseBackend(fakeClient().client, REDIRECT);
    expect(await good.signIn({ email: 'a@b.co', password: 'password123' })).toEqual({ id: 'u1', email: 'a@b.co', displayName: 'דנה' });
    expect((await good.getUser())?.displayName).toBe('דנה');

    const bad = createSupabaseBackend(fakeClient({ auth: { signInWithPassword: vi.fn(async () => ({ data: {}, error: { code: 'invalid_credentials', message: 'Invalid login credentials' } })) } }).client, REDIRECT);
    await expect(bad.signIn({ email: 'a@b.co', password: 'wrong' })).rejects.toMatchObject({ code: 'invalid_credentials' });
  });

  it('sends password resets back to the app root, without a hash that would swallow the code', async () => {
    const { client, raw } = fakeClient();
    await createSupabaseBackend(client, REDIRECT).sendPasswordReset('a@b.co');
    expect(raw.auth.resetPasswordForEmail).toHaveBeenCalledWith('a@b.co', { redirectTo: 'https://app.example/trips/' });
  });

  it('translates auth state events for the app', () => {
    const { client, authListeners } = fakeClient();
    const seen: string[] = [];
    createSupabaseBackend(client, REDIRECT).onAuthChange((u, e) => seen.push(`${e}:${u?.displayName ?? '-'}`));
    authListeners[0]('SIGNED_IN', { user: { id: 'u1', user_metadata: { display_name: 'דנה' } } });
    authListeners[0]('PASSWORD_RECOVERY', { user: { id: 'u1', user_metadata: {} } });
    authListeners[0]('SIGNED_OUT', null);
    expect(seen).toEqual(['SIGNED_IN:דנה', 'PASSWORD_RECOVERY:מטייל', 'SIGNED_OUT:-']);
  });

  it('updates the profile row and the metadata together when the name changes', async () => {
    const { client, calls, raw } = fakeClient();
    const user = await createSupabaseBackend(client, REDIRECT).updateDisplayName(' חדש ');
    expect(writeOp(calls, 'profiles', 'update')).toEqual([{ display_name: 'חדש' }]);
    expect(raw.auth.updateUser).toHaveBeenCalledWith({ data: { display_name: 'חדש' } });
    expect(user.displayName).toBe('חדש');
  });

  it('deletes the account through the database function, then drops the session', async () => {
    const { client, raw } = fakeClient();
    await createSupabaseBackend(client, REDIRECT).deleteAccount();
    expect(raw.rpc).toHaveBeenCalledWith('delete_my_account');
    expect(raw.auth.signOut).toHaveBeenCalled();
  });
});

describe('private data', () => {
  it('reads only well-formed blobs and upserts for the signed-in user', async () => {
    const good = fakeClient({ results: { 'user_data.select': { data: { data: { v: 1, keys: { saved: { at: 't', value: ['x'] } } } } } } });
    expect((await createSupabaseBackend(good.client, REDIRECT).loadUserData())?.keys.saved?.value).toEqual(['x']);
    expect(good.calls[0].ops).toContainEqual(['eq', ['user_id', 'u1']]);

    const junk = fakeClient({ results: { 'user_data.select': { data: { data: { hello: 'world' } } } } });
    expect(await createSupabaseBackend(junk.client, REDIRECT).loadUserData()).toBeNull();

    const save = fakeClient();
    await createSupabaseBackend(save.client, REDIRECT).saveUserData({ v: 1, keys: {} });
    expect(writeOp(save.calls, 'user_data', 'upsert')).toEqual([{ user_id: 'u1', data: { v: 1, keys: {} } }, { onConflict: 'user_id' }]);
  });

  it('surfaces database errors as friendly codes', async () => {
    const { client } = fakeClient({ results: { 'user_data.select': { error: { code: 'PGRST301', message: 'JWT expired' } } } });
    await expect(createSupabaseBackend(client, REDIRECT).loadUserData()).rejects.toMatchObject({ code: 'not_signed_in' });
  });
});

describe('reviews', () => {
  it('lists a place newest first, from the public view', async () => {
    const row = { id: 'r1', place_id: 'kasol', user_id: 'u2', stars: 4, body: 'x', visited: '2026-01', cost_usd: null, tags: ['vibe'], created_at: '2026-01-02T00:00:00Z', author: 'יוסי' };
    const { client, calls } = fakeClient({ results: { 'reviews_public.select': { data: [row] } } });
    const list = await createSupabaseBackend(client, REDIRECT).listReviews('kasol');
    expect(list[0]).toMatchObject({ author: 'יוסי', tags: ['vibe'] });
    expect(calls[0].table).toBe('reviews_public');
    expect(calls[0].ops).toContainEqual(['eq', ['place_id', 'kasol']]);
    expect(calls[0].ops).toContainEqual(['order', ['created_at', { ascending: false }]]);
  });

  it('saves with an upsert keyed on user and place, and returns the author from the current profile', async () => {
    const stored = { id: 'r9', place_id: 'kasol', user_id: 'u1', stars: 5, body: 'מעולה', visited: '2026-02', cost_usd: 10, tags: ['safe-alone'], created_at: '2026-02-03T00:00:00Z' };
    const { client, calls } = fakeClient({ results: { 'reviews.upsert': { data: stored } } });
    const saved = await createSupabaseBackend(client, REDIRECT).saveReview({ placeId: 'kasol', stars: 5, text: 'מעולה', visited: '2026-02', costUsd: 10, tags: ['safe-alone'] });
    expect(writeOp(calls, 'reviews', 'upsert')).toEqual([
      { user_id: 'u1', place_id: 'kasol', stars: 5, body: 'מעולה', visited: '2026-02', cost_usd: 10, tags: ['safe-alone'] },
      { onConflict: 'user_id,place_id' },
    ]);
    expect(saved).toMatchObject({ id: 'r9', author: 'דנה', text: 'מעולה' });
  });

  it('treats a repeated report as success but surfaces other failures', async () => {
    const dup = fakeClient({ results: { 'reports.insert': { error: { code: '23505', message: 'duplicate key' } } } });
    await expect(createSupabaseBackend(dup.client, REDIRECT).reportReview('r1', 'spam')).resolves.toBeUndefined();

    const bad = fakeClient({ results: { 'reports.insert': { error: { code: '42501', message: 'rls' } } } });
    await expect(createSupabaseBackend(bad.client, REDIRECT).reportReview('r1', 'spam')).rejects.toMatchObject({ code: 'not_signed_in' });
  });

  it('refuses to write when nobody is signed in', async () => {
    const { client } = fakeClient({ auth: { getSession: vi.fn(async () => ({ data: { session: null }, error: null })) } });
    await expect(createSupabaseBackend(client, REDIRECT).saveReview({ placeId: 'p', stars: 4, text: '', visited: '2026-01', tags: [] })).rejects.toMatchObject({ code: 'not_signed_in' });
  });
});
