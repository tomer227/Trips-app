import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import {
  CloudError,
  PASSWORD_MIN,
  validateDisplayName,
  validateEmail,
  type AuthEvent,
  type CloudBackend,
  type CloudReview,
  type CloudUser,
  type NewReview,
  type SyncBlob,
} from './types';

interface ErrorLike {
  name?: string;
  message?: string;
  code?: string | number;
  status?: number;
}

/** Folds Supabase auth and PostgREST errors into the app's small set of user-facing codes. */
export function mapSupabaseError(err: unknown): CloudError {
  if (err instanceof CloudError) return err;
  const e = (err ?? {}) as ErrorLike;
  const code = String(e.code ?? '');
  const message = (e.message ?? '').toLowerCase();

  if (e.name === 'AuthRetryableFetchError' || message.includes('failed to fetch') || message.includes('network')) return new CloudError('network');
  if (code === 'invalid_credentials' || message.includes('invalid login credentials')) return new CloudError('invalid_credentials');
  if (code === 'user_already_exists' || code === 'email_exists' || message.includes('already registered')) return new CloudError('email_taken');
  if (code === 'weak_password' || message.includes('password should be')) return new CloudError('weak_password');
  if (code === 'email_not_confirmed' || message.includes('email not confirmed')) return new CloudError('email_not_confirmed');
  if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit' || e.status === 429 || message.includes('rate limit')) return new CloudError('rate_limited');
  if (code === 'validation_failed' && message.includes('email')) return new CloudError('invalid_email');
  // Row Level Security violations and expired sessions both mean "not allowed as this user".
  if (code === '42501' || code === 'PGRST301' || code === 'PGRST303' || message.includes('jwt')) return new CloudError('not_signed_in');
  if (code === 'P0001' && message.includes('rate limit')) return new CloudError('rate_limited');
  return new CloudError('unknown', e.message);
}

function toUser(user: User | null | undefined): CloudUser | null {
  if (!user) return null;
  const name = typeof user.user_metadata?.display_name === 'string' ? user.user_metadata.display_name.trim() : '';
  return { id: user.id, email: user.email ?? undefined, displayName: name || 'מטייל' };
}

interface ReviewRow {
  id: string;
  place_id: string;
  user_id: string;
  stars: number;
  body: string;
  visited: string;
  cost_usd: number | string | null;
  tags: string[] | null;
  created_at: string;
  author: string | null;
}

export function rowToReview(row: ReviewRow): CloudReview {
  const cost = row.cost_usd === null || row.cost_usd === undefined ? undefined : Number(row.cost_usd);
  return {
    id: row.id,
    placeId: row.place_id,
    userId: row.user_id,
    author: row.author?.trim() || 'מטייל',
    stars: row.stars,
    text: row.body ?? '',
    visited: row.visited,
    costUsd: cost !== undefined && Number.isFinite(cost) && cost > 0 ? cost : undefined,
    tags: row.tags ?? [],
    createdAt: Date.parse(row.created_at) || 0,
  };
}

const EVENTS: Record<string, AuthEvent> = {
  SIGNED_IN: 'SIGNED_IN',
  SIGNED_OUT: 'SIGNED_OUT',
  PASSWORD_RECOVERY: 'PASSWORD_RECOVERY',
  USER_UPDATED: 'USER_UPDATED',
  INITIAL_SESSION: 'INITIAL',
};

export function createSupabaseBackend(client: SupabaseClient, redirectTo: () => string = () => `${location.origin}${location.pathname}`): CloudBackend {
  let cachedUser: CloudUser | null = null;

  const requireUser = async (): Promise<CloudUser> => {
    const user = cachedUser ?? (await backend.getUser());
    if (!user) throw new CloudError('not_signed_in');
    return user;
  };

  const backend: CloudBackend = {
    kind: 'supabase',

    async getUser() {
      // getSession reads the stored session; it does not need the network.
      const { data, error } = await client.auth.getSession();
      if (error) throw mapSupabaseError(error);
      cachedUser = toUser(data.session?.user);
      return cachedUser;
    },

    onAuthChange(cb) {
      const { data } = client.auth.onAuthStateChange((event: string, session: Session | null) => {
        cachedUser = toUser(session?.user);
        cb(cachedUser, EVENTS[event] ?? 'USER_UPDATED');
      });
      return () => data.subscription.unsubscribe();
    },

    async signUp({ email, password, displayName }) {
      if (!validateEmail(email)) throw new CloudError('invalid_email');
      if (!validateDisplayName(displayName)) throw new CloudError('invalid_name');
      if (password.length < PASSWORD_MIN) throw new CloudError('weak_password');
      const { data, error } = await client.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { display_name: displayName.trim() }, emailRedirectTo: redirectTo() },
      });
      if (error) throw mapSupabaseError(error);
      // With email confirmation on, an existing address comes back as a user with no identities.
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) throw new CloudError('email_taken');
      cachedUser = toUser(data.session?.user);
      return { user: toUser(data.user), needsConfirmation: !data.session };
    },

    async signIn({ email, password }) {
      const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw mapSupabaseError(error);
      cachedUser = toUser(data.user);
      if (!cachedUser) throw new CloudError('unknown');
      return cachedUser;
    },

    async signOut() {
      const { error } = await client.auth.signOut();
      cachedUser = null;
      if (error) throw mapSupabaseError(error);
    },

    async sendPasswordReset(email) {
      if (!validateEmail(email)) throw new CloudError('invalid_email');
      // No "#/..." here: Supabase appends ?code=... to this URL, and a hash would swallow it.
      // The app moves to the account screen itself when it sees the recovery event.
      const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: redirectTo() });
      if (error) throw mapSupabaseError(error);
    },

    async updatePassword(password) {
      if (password.length < PASSWORD_MIN) throw new CloudError('weak_password');
      const { error } = await client.auth.updateUser({ password });
      if (error) throw mapSupabaseError(error);
    },

    async updateDisplayName(name) {
      if (!validateDisplayName(name)) throw new CloudError('invalid_name');
      const user = await requireUser();
      const clean = name.trim();
      // The profile row is what other people see next to a review; the metadata is what this app reads first.
      const { error: profileError } = await client.from('profiles').update({ display_name: clean }).eq('id', user.id);
      if (profileError) throw mapSupabaseError(profileError);
      const { data, error } = await client.auth.updateUser({ data: { display_name: clean } });
      if (error) throw mapSupabaseError(error);
      cachedUser = toUser(data.user) ?? { ...user, displayName: clean };
      return cachedUser;
    },

    async deleteAccount() {
      await requireUser();
      const { error } = await client.rpc('delete_my_account');
      if (error) throw mapSupabaseError(error);
      cachedUser = null;
      // The session is now orphaned; ignore a failure to tell the server about it.
      await client.auth.signOut().catch(() => undefined);
    },

    async loadUserData() {
      const user = await requireUser();
      const { data, error } = await client.from('user_data').select('data').eq('user_id', user.id).maybeSingle();
      if (error) throw mapSupabaseError(error);
      const blob = data?.data as SyncBlob | undefined;
      return blob && blob.v === 1 && blob.keys ? blob : null;
    },

    async saveUserData(blob) {
      const user = await requireUser();
      const { error } = await client.from('user_data').upsert({ user_id: user.id, data: blob }, { onConflict: 'user_id' });
      if (error) throw mapSupabaseError(error);
    },

    async listReviews(placeId) {
      const { data, error } = await client
        .from('reviews_public')
        .select('id, place_id, user_id, stars, body, visited, cost_usd, tags, created_at, author')
        .eq('place_id', placeId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw mapSupabaseError(error);
      return ((data ?? []) as ReviewRow[]).map(rowToReview);
    },

    async saveReview(review: NewReview) {
      const user = await requireUser();
      const { data, error } = await client
        .from('reviews')
        .upsert(
          {
            user_id: user.id,
            place_id: review.placeId,
            stars: review.stars,
            body: review.text,
            visited: review.visited,
            cost_usd: review.costUsd ?? null,
            tags: review.tags,
          },
          { onConflict: 'user_id,place_id' },
        )
        .select('id, place_id, user_id, stars, body, visited, cost_usd, tags, created_at')
        .single();
      if (error) throw mapSupabaseError(error);
      return rowToReview({ ...(data as Omit<ReviewRow, 'author'>), author: user.displayName });
    },

    async deleteReview(id) {
      const { error } = await client.from('reviews').delete().eq('id', id);
      if (error) throw mapSupabaseError(error);
    },

    async reportReview(id, reason) {
      const user = await requireUser();
      const { error } = await client.from('reports').insert({ review_id: id, reporter_id: user.id, reason: reason.slice(0, 500) });
      // 23505: this user already reported the review – that is fine.
      if (error && String(error.code) !== '23505') throw mapSupabaseError(error);
    },
  };

  return backend;
}
