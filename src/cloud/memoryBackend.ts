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

interface MemUser {
  id: string;
  email: string;
  password: string;
  displayName: string;
}

interface MemState {
  users: MemUser[];
  sessionUserId: string | null;
  userData: Record<string, SyncBlob>;
  reviews: (CloudReview & { hidden?: boolean })[];
  reports: { reviewId: string; reporterId: string; reason: string }[];
}

const KEY = 'memory-cloud';

const empty = (): MemState => ({ users: [], sessionUserId: null, userData: {}, reviews: [], reports: [] });

/**
 * A complete in-memory stand-in for the cloud, persisted in localStorage so it survives reloads.
 * Used by tests and for trying the account UI without a Supabase project (VITE_CLOUD=memory).
 * It mimics the rules of the real backend: password length, unique emails, one review per user and
 * place, hiding after three reports.
 */
export function createMemoryBackend(storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = safeStorage()): CloudBackend {
  let state = load();
  const listeners = new Set<(u: CloudUser | null, e: AuthEvent) => void>();

  function load(): MemState {
    try {
      const raw = storage?.getItem(KEY);
      return raw ? { ...empty(), ...JSON.parse(raw) } : empty();
    } catch {
      return empty();
    }
  }

  function save() {
    try {
      storage?.setItem(KEY, JSON.stringify(state));
    } catch {
      // ignore: memory-only mode
    }
  }

  const toUser = (u: MemUser): CloudUser => ({ id: u.id, email: u.email, displayName: u.displayName });
  const current = (): MemUser | undefined => state.users.find((u) => u.id === state.sessionUserId);
  const requireUser = (): MemUser => {
    // Another tab may have changed the state.
    state = load();
    const u = current();
    if (!u) throw new CloudError('not_signed_in');
    return u;
  };
  const emit = (event: AuthEvent) => {
    const u = current();
    listeners.forEach((l) => l(u ? toUser(u) : null, event));
  };
  const delay = () => new Promise((r) => setTimeout(r, 0));

  return {
    kind: 'memory',

    async getUser() {
      state = load();
      const u = current();
      return u ? toUser(u) : null;
    },

    onAuthChange(cb) {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },

    async signUp({ email, password, displayName }) {
      await delay();
      const e = email.trim().toLowerCase();
      if (!validateEmail(e)) throw new CloudError('invalid_email');
      if (!validateDisplayName(displayName)) throw new CloudError('invalid_name');
      if (password.length < PASSWORD_MIN) throw new CloudError('weak_password');
      state = load();
      if (state.users.some((u) => u.email === e)) throw new CloudError('email_taken');
      const user: MemUser = { id: crypto.randomUUID(), email: e, password, displayName: displayName.trim() };
      state.users.push(user);
      state.sessionUserId = user.id;
      save();
      emit('SIGNED_IN');
      return { user: toUser(user), needsConfirmation: false };
    },

    async signIn({ email, password }) {
      await delay();
      state = load();
      const user = state.users.find((u) => u.email === email.trim().toLowerCase());
      if (!user || user.password !== password) throw new CloudError('invalid_credentials');
      state.sessionUserId = user.id;
      save();
      emit('SIGNED_IN');
      return toUser(user);
    },

    async signOut() {
      state = load();
      state.sessionUserId = null;
      save();
      emit('SIGNED_OUT');
    },

    async sendPasswordReset(email) {
      await delay();
      if (!validateEmail(email)) throw new CloudError('invalid_email');
      // Like the real service: the answer is the same whether or not the account exists.
    },

    async updatePassword(password) {
      const u = requireUser();
      if (password.length < PASSWORD_MIN) throw new CloudError('weak_password');
      u.password = password;
      save();
    },

    async updateDisplayName(name) {
      const u = requireUser();
      if (!validateDisplayName(name)) throw new CloudError('invalid_name');
      u.displayName = name.trim();
      // Author names on existing reviews follow the profile, as in the database view.
      for (const r of state.reviews) if (r.userId === u.id) r.author = u.displayName;
      save();
      emit('USER_UPDATED');
      return toUser(u);
    },

    async deleteAccount() {
      const u = requireUser();
      state.users = state.users.filter((x) => x.id !== u.id);
      state.reviews = state.reviews.filter((r) => r.userId !== u.id);
      delete state.userData[u.id];
      state.sessionUserId = null;
      save();
      emit('SIGNED_OUT');
    },

    async loadUserData() {
      const u = requireUser();
      return state.userData[u.id] ?? null;
    },

    async saveUserData(blob) {
      const u = requireUser();
      state.userData[u.id] = blob;
      save();
    },

    async listReviews(placeId) {
      state = load();
      const me = state.sessionUserId;
      return state.reviews
        .filter((r) => r.placeId === placeId && (!r.hidden || r.userId === me))
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(({ hidden: _hidden, ...r }) => r);
    },

    async saveReview(input: NewReview) {
      const u = requireUser();
      if (input.stars < 1 || input.stars > 5) throw new CloudError('unknown', 'stars out of range');
      const existing = state.reviews.find((r) => r.userId === u.id && r.placeId === input.placeId);
      const review: CloudReview = {
        id: existing?.id ?? crypto.randomUUID(),
        userId: u.id,
        author: u.displayName,
        createdAt: existing?.createdAt ?? Date.now(),
        ...input,
      };
      state.reviews = [...state.reviews.filter((r) => r.id !== review.id), { ...review, hidden: (existing as { hidden?: boolean } | undefined)?.hidden }];
      save();
      return review;
    },

    async deleteReview(id) {
      const u = requireUser();
      state.reviews = state.reviews.filter((r) => !(r.id === id && r.userId === u.id));
      save();
    },

    async reportReview(id, reason) {
      const u = requireUser();
      if (state.reports.some((r) => r.reviewId === id && r.reporterId === u.id)) return;
      state.reports.push({ reviewId: id, reporterId: u.id, reason });
      const reporters = new Set(state.reports.filter((r) => r.reviewId === id).map((r) => r.reporterId));
      if (reporters.size >= 3) {
        const review = state.reviews.find((r) => r.id === id);
        if (review) review.hidden = true;
      }
      save();
    },
  };
}

function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}
