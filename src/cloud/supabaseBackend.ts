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
  type ModKind,
  type NewPartnerPost,
  type NewReview,
  type PartnerKind,
  type PartnerPost,
  type PartnerReply,
  type SyncBlob,
  PARTNER_REPLY_MAX,
  cleanTripWindows,
  validatePartnerPost,
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
  if (code === 'P0001' && message.includes('partner post limit')) return new CloudError('too_many_posts');
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

interface PartnerPostRow {
  id: string;
  user_id: string;
  country_id: string;
  from_date: string;
  to_date: string;
  kind: PartnerKind;
  body: string;
  created_at: string;
  author: string | null;
}

export const rowToPartnerPost = (r: PartnerPostRow): PartnerPost => ({
  id: r.id,
  userId: r.user_id,
  author: r.author?.trim() || 'מטייל',
  countryId: r.country_id,
  from: r.from_date,
  to: r.to_date,
  kind: r.kind,
  text: r.body,
  createdAt: Date.parse(r.created_at) || 0,
});

const PARTNER_POST_COLUMNS = 'id, user_id, country_id, from_date, to_date, kind, body, created_at, author';

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

    async publishTrip(windows) {
      await requireUser();
      const p_windows = cleanTripWindows(windows).map((w) => ({ country_id: w.countryId, from_date: w.from, to_date: w.to }));
      const { error } = await client.rpc('set_my_trip', { p_windows });
      if (error) throw mapSupabaseError(error);
    },

    async whoElseThere() {
      await requireUser();
      const { data, error } = await client.rpc('who_else_there');
      if (error) throw mapSupabaseError(error);
      return ((data ?? []) as { display_name: string | null; country_id: string; from_date: string; to_date: string }[]).map((r) => ({
        name: r.display_name ?? 'מטייל',
        countryId: r.country_id,
        from: r.from_date,
        to: r.to_date,
      }));
    },

    async listPartnerPosts() {
      await requireUser();
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await client
        .from('partner_posts_public')
        .select(PARTNER_POST_COLUMNS)
        .gte('to_date', today)
        .order('from_date', { ascending: true })
        .limit(200);
      if (error) throw mapSupabaseError(error);
      return ((data ?? []) as PartnerPostRow[]).map(rowToPartnerPost);
    },

    async createPartnerPost(post: NewPartnerPost) {
      const user = await requireUser();
      const problem = validatePartnerPost(post);
      if (problem) throw new CloudError('unknown', problem);
      const { data, error } = await client
        .from('partner_posts')
        .insert({ user_id: user.id, country_id: post.countryId, from_date: post.from, to_date: post.to, kind: post.kind, body: post.text.trim() })
        .select('id, user_id, country_id, from_date, to_date, kind, body, created_at')
        .single();
      if (error) throw mapSupabaseError(error);
      return rowToPartnerPost({ ...(data as Omit<PartnerPostRow, 'author'>), author: user.displayName });
    },

    async deletePartnerPost(id) {
      await requireUser();
      const { error } = await client.from('partner_posts').delete().eq('id', id);
      if (error) throw mapSupabaseError(error);
    },

    async replyToPartnerPost(postId, text) {
      const user = await requireUser();
      const body = text.trim().slice(0, PARTNER_REPLY_MAX);
      const { error } = await client.from('partner_replies').insert({ post_id: postId, user_id: user.id, body });
      if (error && String(error.code) === '23505') throw new CloudError('already_replied');
      if (error) throw mapSupabaseError(error);
    },

    async listPartnerReplies() {
      await requireUser();
      const { data, error } = await client
        .from('partner_replies_public')
        .select('id, post_id, user_id, body, created_at, author')
        .order('created_at', { ascending: false })
        .limit(300);
      if (error) throw mapSupabaseError(error);
      return ((data ?? []) as { id: string; post_id: string; user_id: string; body: string; created_at: string; author: string | null }[]).map(
        (r): PartnerReply => ({
          id: r.id,
          postId: r.post_id,
          userId: r.user_id,
          author: r.author?.trim() || 'מטייל',
          text: r.body,
          createdAt: Date.parse(r.created_at) || 0,
        }),
      );
    },

    async deletePartnerReply(id) {
      await requireUser();
      const { error } = await client.from('partner_replies').delete().eq('id', id);
      if (error) throw mapSupabaseError(error);
    },

    async reportPartnerPost(id, reason) {
      const user = await requireUser();
      const { error } = await client.from('partner_reports').insert({ post_id: id, reporter_id: user.id, reason: reason.slice(0, 500) });
      // 23505: this user already reported the post – that is fine.
      if (error && String(error.code) !== '23505') throw mapSupabaseError(error);
    },

    async isModerator() {
      if (!(await backend.getUser())) return false;
      const { data, error } = await client.rpc('is_moderator');
      if (error) throw mapSupabaseError(error);
      return data === true;
    },

    async moderationQueue() {
      await requireUser();
      const { data, error } = await client.rpc('mod_queue');
      if (error) throw mapSupabaseError(error);
      type Row = { kind: ModKind; id: string; body: string; author: string | null; subject: string; hidden: boolean; reports: number | string; reasons: string[] | null; created_at: string };
      return ((data ?? []) as Row[]).map((r) => ({
        kind: r.kind,
        id: r.id,
        text: r.body,
        author: r.author ?? 'מטייל',
        subject: r.subject,
        hidden: r.hidden,
        reports: Number(r.reports) || 0,
        reasons: r.reasons ?? [],
        createdAt: Date.parse(r.created_at),
      }));
    },

    async moderate(kind, id, action) {
      await requireUser();
      const { error } = await client.rpc('mod_act', { p_kind: kind, p_id: id, p_action: action });
      if (error) throw mapSupabaseError(error);
    },
  };

  return backend;
}
