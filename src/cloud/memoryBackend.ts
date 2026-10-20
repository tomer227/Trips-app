import {
  CloudError,
  PASSWORD_MIN,
  validateDisplayName,
  validateEmail,
  type AuthEvent,
  type CloudBackend,
  type CloudReview,
  type CloudUser,
  type FellowTraveler,
  type Meetup,
  type ModItem,
  type NewReview,
  type PartnerPost,
  type PartnerReply,
  type SyncBlob,
  type TripWindow,
  MAX_ACTIVE_PARTNER_POSTS,
  PARTNER_REPLY_MAX,
  cleanTripWindows,
  MAX_UPCOMING_MEETUPS,
  validateMeetup,
  validatePartnerPost,
  windowsOverlap,
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
  trips: Record<string, TripWindow[]>;
  partnerPosts: (PartnerPost & { hidden?: boolean })[];
  partnerReplies: PartnerReply[];
  partnerReports: { postId: string; reporterId: string; reason?: string }[];
  /** User ids that may moderate (tests and VITE_CLOUD=memory set it directly). */
  moderators: string[];
  meetups: (Omit<Meetup, 'going' | 'iAmGoing' | 'author'> & { hidden?: boolean })[];
  going: { meetupId: string; userId: string }[];
  meetupReports: { meetupId: string; reporterId: string; reason: string }[];
}

const KEY = 'memory-cloud';

const empty = (): MemState => ({ users: [], sessionUserId: null, userData: {}, reviews: [], reports: [], trips: {}, partnerPosts: [], partnerReplies: [], partnerReports: [], moderators: [], meetups: [], going: [], meetupReports: [] });

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
      for (const p of state.partnerPosts) if (p.userId === u.id) p.author = u.displayName;
      for (const r of state.partnerReplies) if (r.userId === u.id) r.author = u.displayName;
      save();
      emit('USER_UPDATED');
      return toUser(u);
    },

    async deleteAccount() {
      const u = requireUser();
      state.users = state.users.filter((x) => x.id !== u.id);
      state.reviews = state.reviews.filter((r) => r.userId !== u.id);
      delete state.userData[u.id];
      delete state.trips[u.id];
      const gone = new Set(state.partnerPosts.filter((p) => p.userId === u.id).map((p) => p.id));
      state.partnerPosts = state.partnerPosts.filter((p) => p.userId !== u.id);
      state.partnerReplies = state.partnerReplies.filter((r) => r.userId !== u.id && !gone.has(r.postId));
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

    async publishTrip(windows) {
      const u = requireUser();
      const clean = cleanTripWindows(windows);
      if (clean.length) state.trips[u.id] = clean;
      else delete state.trips[u.id];
      save();
    },

    async whoElseThere() {
      const u = requireUser();
      const mine = state.trips[u.id] ?? [];
      const today = new Date().toISOString().slice(0, 10);
      const found: FellowTraveler[] = [];
      for (const [userId, windows] of Object.entries(state.trips)) {
        if (userId === u.id) continue;
        const name = state.users.find((x) => x.id === userId)?.displayName;
        if (!name) continue;
        for (const w of windows) if (w.to >= today && mine.some((m) => windowsOverlap(m, w))) found.push({ name, ...w });
      }
      return found.sort((a, b) => a.from.localeCompare(b.from));
    },

    async listPartnerPosts() {
      requireUser();
      const today = new Date().toISOString().slice(0, 10);
      return state.partnerPosts
        .filter((p) => !p.hidden && p.to >= today)
        .sort((a, b) => a.from.localeCompare(b.from))
        .map(({ hidden: _hidden, ...p }) => p);
    },

    async createPartnerPost(input) {
      const u = requireUser();
      const problem = validatePartnerPost(input);
      if (problem) throw new CloudError('invalid_input', problem, problem);
      const today = new Date().toISOString().slice(0, 10);
      if (state.partnerPosts.filter((p) => p.userId === u.id && p.to >= today).length >= MAX_ACTIVE_PARTNER_POSTS) throw new CloudError('too_many_posts');
      const post: PartnerPost = { ...input, text: input.text.trim(), id: crypto.randomUUID(), userId: u.id, author: u.displayName, createdAt: Date.now() };
      state.partnerPosts.push(post);
      save();
      return post;
    },

    async deletePartnerPost(id) {
      const u = requireUser();
      if (!state.partnerPosts.some((p) => p.id === id && p.userId === u.id)) return;
      state.partnerPosts = state.partnerPosts.filter((p) => p.id !== id);
      state.partnerReplies = state.partnerReplies.filter((r) => r.postId !== id);
      save();
    },

    async replyToPartnerPost(postId, text) {
      const u = requireUser();
      const today = new Date().toISOString().slice(0, 10);
      const post = state.partnerPosts.find((p) => p.id === postId && !p.hidden && p.to >= today);
      const body = text.trim().slice(0, PARTNER_REPLY_MAX);
      if (!post || post.userId === u.id || body.length < 2) throw new CloudError('not_allowed', 'cannot reply');
      if (state.partnerReplies.some((r) => r.postId === postId && r.userId === u.id)) throw new CloudError('already_replied');
      state.partnerReplies.push({ id: crypto.randomUUID(), postId, userId: u.id, author: u.displayName, text: body, createdAt: Date.now() });
      save();
    },

    async listPartnerReplies() {
      const u = requireUser();
      const mine = new Set(state.partnerPosts.filter((p) => p.userId === u.id).map((p) => p.id));
      return state.partnerReplies.filter((r) => r.userId === u.id || mine.has(r.postId)).sort((a, b) => b.createdAt - a.createdAt);
    },

    async deletePartnerReply(id) {
      const u = requireUser();
      const mine = new Set(state.partnerPosts.filter((p) => p.userId === u.id).map((p) => p.id));
      state.partnerReplies = state.partnerReplies.filter((r) => !(r.id === id && (r.userId === u.id || mine.has(r.postId))));
      save();
    },

    async reportPartnerPost(id, reason) {
      const u = requireUser();
      if (state.partnerReports.some((r) => r.postId === id && r.reporterId === u.id)) return;
      state.partnerReports.push({ postId: id, reporterId: u.id, reason });
      if (new Set(state.partnerReports.filter((r) => r.postId === id).map((r) => r.reporterId)).size >= 3) {
        const post = state.partnerPosts.find((p) => p.id === id);
        if (post) post.hidden = true;
      }
      save();
    },

    async listMeetups() {
      const u = requireUser();
      const since = Date.now() - 12 * 3_600_000;
      const name = (id: string) => state.users.find((x) => x.id === id)?.displayName ?? 'מטייל';
      return state.meetups
        .filter((m) => !m.hidden && Date.parse(m.startsAt) > since)
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
        .map(({ hidden: _hidden, ...m }) => ({
          ...m,
          author: name(m.userId),
          going: state.going.filter((g) => g.meetupId === m.id).length,
          iAmGoing: state.going.some((g) => g.meetupId === m.id && g.userId === u.id),
        }));
    },

    async createMeetup(input) {
      const u = requireUser();
      const problem = validateMeetup(input);
      if (problem) throw new CloudError('invalid_input', problem, problem);
      if (state.meetups.filter((m) => m.userId === u.id && Date.parse(m.startsAt) > Date.now()).length >= MAX_UPCOMING_MEETUPS) throw new CloudError('too_many_meetups');
      const meetup = {
        ...input,
        title: input.title.trim(),
        text: input.text.trim(),
        placeLabel: input.placeLabel.trim(),
        startsAt: new Date(input.startsAt).toISOString(),
        id: crypto.randomUUID(),
        userId: u.id,
        createdAt: Date.now(),
      };
      state.meetups.push(meetup);
      save();
      await delay();
      return { ...meetup, author: u.displayName, going: 0, iAmGoing: false };
    },

    async deleteMeetup(id) {
      const u = requireUser();
      state.meetups = state.meetups.filter((m) => !(m.id === id && m.userId === u.id));
      state.going = state.going.filter((g) => state.meetups.some((m) => m.id === g.meetupId));
      save();
    },

    async setGoing(id, going) {
      const u = requireUser();
      state.going = state.going.filter((g) => !(g.meetupId === id && g.userId === u.id));
      const visible = state.meetups.some((m) => m.id === id && !m.hidden);
      if (going && visible) state.going.push({ meetupId: id, userId: u.id });
      save();
    },

    async reportMeetup(id, reason) {
      const u = requireUser();
      if (state.meetupReports.some((r) => r.meetupId === id && r.reporterId === u.id)) return;
      state.meetupReports.push({ meetupId: id, reporterId: u.id, reason });
      if (new Set(state.meetupReports.filter((r) => r.meetupId === id).map((r) => r.reporterId)).size >= 3) {
        const m = state.meetups.find((x) => x.id === id);
        if (m) m.hidden = true;
      }
      save();
    },

    async isModerator() {
      state = load();
      const u = current();
      return !!u && state.moderators.includes(u.id);
    },

    async moderationQueue() {
      const u = requireUser();
      if (!state.moderators.includes(u.id)) throw new CloudError('not_signed_in');
      const name = (id: string) => state.users.find((x) => x.id === id)?.displayName ?? 'מטייל';
      const items: ModItem[] = [
        ...state.reviews.map((r) => {
          const reps = state.reports.filter((x) => x.reviewId === r.id);
          return { kind: 'review' as const, id: r.id, text: r.text, author: name(r.userId), subject: r.placeId, hidden: !!r.hidden, reports: reps.length, reasons: reps.map((x) => x.reason).filter(Boolean), createdAt: r.createdAt };
        }),
        ...state.partnerPosts.map((p) => {
          const reps = state.partnerReports.filter((x) => x.postId === p.id);
          return { kind: 'post' as const, id: p.id, text: p.text, author: name(p.userId), subject: p.countryId, hidden: !!p.hidden, reports: reps.length, reasons: reps.map((x) => x.reason ?? '').filter(Boolean), createdAt: p.createdAt };
        }),
        ...state.meetups.map((m) => {
          const reps = state.meetupReports.filter((x) => x.meetupId === m.id);
          return { kind: 'meetup' as const, id: m.id, text: `${m.title}\n${m.placeLabel}${m.text ? `\n${m.text}` : ''}`, author: name(m.userId), subject: m.countryId, hidden: !!m.hidden, reports: reps.length, reasons: reps.map((x) => x.reason).filter(Boolean), createdAt: m.createdAt };
        }),
      ];
      return items.filter((i) => i.hidden || i.reports > 0).sort((a, b) => Number(b.hidden) - Number(a.hidden) || b.reports - a.reports || b.createdAt - a.createdAt);
    },

    async moderate(kind, id, action) {
      const u = requireUser();
      if (!state.moderators.includes(u.id)) throw new CloudError('not_signed_in');
      const list: { id: string; hidden?: boolean }[] = kind === 'review' ? state.reviews : kind === 'post' ? state.partnerPosts : state.meetups;
      const item = list.find((x) => x.id === id);
      if (!item) return;
      if (action === 'delete') {
        if (kind === 'review') state.reviews = state.reviews.filter((x) => x.id !== id);
        else if (kind === 'post') state.partnerPosts = state.partnerPosts.filter((x) => x.id !== id);
        else state.meetups = state.meetups.filter((x) => x.id !== id);
      } else {
        item.hidden = action === 'hide';
        if (action === 'restore') {
          if (kind === 'review') state.reports = state.reports.filter((x) => x.reviewId !== id);
          else if (kind === 'post') state.partnerReports = state.partnerReports.filter((x) => x.postId !== id);
          else state.meetupReports = state.meetupReports.filter((x) => x.meetupId !== id);
        }
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
