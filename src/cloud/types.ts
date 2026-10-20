/** Everything the app needs from an account/cloud backend. Supabase implements it; tests use an in-memory one. */

export interface CloudUser {
  id: string;
  email?: string;
  displayName: string;
}

export type CloudErrorCode =
  | 'invalid_credentials'
  | 'email_taken'
  | 'weak_password'
  | 'invalid_email'
  | 'invalid_name'
  | 'email_not_confirmed'
  | 'rate_limited'
  | 'network'
  | 'not_signed_in'
  | 'too_many_posts'
  | 'already_replied'
  | 'too_many_meetups'
  | 'unknown';

export class CloudError extends Error {
  constructor(public code: CloudErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'CloudError';
  }
}

export const cloudErrorMessages: Record<CloudErrorCode, string> = {
  invalid_credentials: 'האימייל או הסיסמה שגויים.',
  email_taken: 'כבר קיים חשבון עם האימייל הזה. נסו להתחבר או לאפס סיסמה.',
  weak_password: 'הסיסמה חלשה מדי. השתמשו ב־8 תווים לפחות.',
  invalid_email: 'כתובת האימייל לא תקינה.',
  invalid_name: 'השם צריך להכיל בין 2 ל־30 תווים.',
  email_not_confirmed: 'האימייל עוד לא אומת. בדקו את תיבת הדואר (וגם את הספאם) ולחצו על הקישור.',
  rate_limited: 'יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.',
  network: 'אין חיבור לשרת. בדקו את האינטרנט ונסו שוב.',
  not_signed_in: 'צריך להתחבר כדי לבצע את הפעולה.',
  too_many_posts: 'אפשר עד 5 מודעות פעילות. מחקו מודעה ישנה כדי לפרסם חדשה.',
  already_replied: 'כבר שלחתם הודעה למודעה הזו.',
  too_many_meetups: 'אפשר עד 3 מפגשים קרובים. מחקו אחד כדי ליצור חדש.',
  unknown: 'משהו השתבש. נסו שוב.',
};

export const PASSWORD_MIN = 8;
export const NAME_MIN = 2;
export const NAME_MAX = 30;

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

export function validateDisplayName(name: string): boolean {
  const n = name.trim();
  return n.length >= NAME_MIN && n.length <= NAME_MAX;
}

/* ─── Reviews ─── */

export interface NewReview {
  placeId: string;
  stars: number;
  text: string;
  /** YYYY-MM */
  visited: string;
  costUsd?: number;
  tags: string[];
}

export interface CloudReview extends NewReview {
  id: string;
  userId: string;
  author: string;
  createdAt: number;
}

/* ─── Private synced data ─── */

export type SyncKey = 'tripPlan' | 'checklist' | 'journal' | 'saved' | 'customPlaces';

export interface SyncEntry {
  /** ISO time of the last change to this key */
  at: string;
  value: unknown;
}

export interface SyncBlob {
  v: 1;
  keys: Partial<Record<SyncKey, SyncEntry>>;
}

/* ─── "מי עוד שם" ─── */

export interface TripWindow {
  countryId: string;
  /** YYYY-MM-DD */
  from: string;
  /** YYYY-MM-DD */
  to: string;
}

export interface FellowTraveler extends TripWindow {
  name: string;
}

/* ─── "מחפשים שותף" ─── */

export type PartnerKind = 'trek' | 'route' | 'ride' | 'room' | 'hangout';

export const partnerKinds: { id: PartnerKind; icon: string; label: string }[] = [
  { id: 'trek', icon: '🥾', label: 'טרק' },
  { id: 'route', icon: '🗺️', label: 'חלק מהמסלול' },
  { id: 'ride', icon: '🚙', label: 'נסיעה / ג׳יפ' },
  { id: 'room', icon: '🛏️', label: 'לחלוק חדר' },
  { id: 'hangout', icon: '🎉', label: 'לצאת ולבלות' },
];

export interface NewPartnerPost extends TripWindow {
  kind: PartnerKind;
  text: string;
}

export interface PartnerPost extends NewPartnerPost {
  id: string;
  userId: string;
  author: string;
  createdAt: number;
}

export interface PartnerReply {
  id: string;
  postId: string;
  userId: string;
  author: string;
  text: string;
  createdAt: number;
}

export const PARTNER_TEXT_MIN = 10;
export const PARTNER_TEXT_MAX = 400;
export const PARTNER_REPLY_MAX = 400;
export const MAX_ACTIVE_PARTNER_POSTS = 5;

/** The same rules as the database; returns an error message in Hebrew, or null when the post is fine. */
export function validatePartnerPost(p: NewPartnerPost, today = new Date().toISOString().slice(0, 10)): string | null {
  const len = p.text.trim().length;
  if (!/^[a-z-]{2,40}$/.test(p.countryId)) return 'בחרו מדינה.';
  if (!partnerKinds.some((k) => k.id === p.kind)) return 'בחרו סוג.';
  if (!ISO_DAY.test(p.from) || !ISO_DAY.test(p.to)) return 'בחרו תאריכים.';
  if (p.to < p.from) return 'תאריך הסיום לפני תאריך ההתחלה.';
  if (p.to < today) return 'התאריכים כבר עברו.';
  if ((Date.parse(p.to) - Date.parse(p.from)) / 86_400_000 > 366) return 'אפשר לפרסם לטווח של עד שנה.';
  if (len < PARTNER_TEXT_MIN) return `כתבו לפחות ${PARTNER_TEXT_MIN} תווים על מה שאתם מחפשים.`;
  if (len > PARTNER_TEXT_MAX) return `עד ${PARTNER_TEXT_MAX} תווים.`;
  return null;
}

/* ─── "מפגשים על המפה" ─── */

export interface NewMeetup {
  countryId: string;
  title: string;
  text: string;
  /** A public spot, e.g. "בית חב״ד קוסקו" */
  placeLabel: string;
  lat: number;
  lng: number;
  /** ISO time */
  startsAt: string;
}

export interface Meetup extends NewMeetup {
  id: string;
  userId: string;
  author: string;
  going: number;
  iAmGoing: boolean;
  createdAt: number;
}

export const MEETUP_TITLE_MIN = 4;
export const MEETUP_TITLE_MAX = 80;
export const MEETUP_TEXT_MAX = 400;
export const MEETUP_PLACE_MIN = 2;
export const MEETUP_PLACE_MAX = 60;
export const MAX_UPCOMING_MEETUPS = 3;
const DAY_MS = 86_400_000;

/** The same rules as the database; returns an error message in Hebrew, or null when it is fine. */
export function validateMeetup(m: NewMeetup, now = Date.now()): string | null {
  if (!/^[a-z-]{2,40}$/.test(m.countryId)) return 'בחרו מדינה.';
  const title = m.title.trim().length;
  if (title < MEETUP_TITLE_MIN || title > MEETUP_TITLE_MAX) return `כתבו כותרת של ${MEETUP_TITLE_MIN} עד ${MEETUP_TITLE_MAX} תווים.`;
  const place = m.placeLabel.trim().length;
  if (place < MEETUP_PLACE_MIN || place > MEETUP_PLACE_MAX) return 'כתבו איפה נפגשים (שם של מקום ציבורי).';
  if (m.text.length > MEETUP_TEXT_MAX) return `הפרטים ארוכים מדי (עד ${MEETUP_TEXT_MAX} תווים).`;
  if (!Number.isFinite(m.lat) || !Number.isFinite(m.lng) || Math.abs(m.lat) > 90 || Math.abs(m.lng) > 180) return 'בחרו מיקום על המפה.';
  const at = Date.parse(m.startsAt);
  if (!Number.isFinite(at)) return 'בחרו תאריך ושעה.';
  if (at < now - 3_600_000) return 'המועד כבר עבר.';
  if (at > now + 60 * DAY_MS) return 'אפשר לקבוע מפגש עד חודשיים קדימה.';
  return null;
}

/* ─── Moderation ─── */

export type ModKind = 'review' | 'post' | 'meetup';
export type ModAction = 'restore' | 'hide' | 'delete';

export interface ModItem {
  kind: ModKind;
  id: string;
  text: string;
  author: string;
  /** Google place id for a review, country id for a partner post */
  subject: string;
  hidden: boolean;
  reports: number;
  reasons: string[];
  createdAt: number;
}

export type AuthEvent = 'SIGNED_IN' | 'SIGNED_OUT' | 'PASSWORD_RECOVERY' | 'USER_UPDATED' | 'INITIAL';

export interface CloudBackend {
  readonly kind: 'supabase' | 'memory';

  getUser(): Promise<CloudUser | null>;
  onAuthChange(cb: (user: CloudUser | null, event: AuthEvent) => void): () => void;

  signUp(input: { email: string; password: string; displayName: string }): Promise<{ user: CloudUser | null; needsConfirmation: boolean }>;
  signIn(input: { email: string; password: string }): Promise<CloudUser>;
  signOut(): Promise<void>;
  sendPasswordReset(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  updateDisplayName(name: string): Promise<CloudUser>;
  /** Deletes the account and everything attached to it. */
  deleteAccount(): Promise<void>;

  loadUserData(): Promise<SyncBlob | null>;
  saveUserData(blob: SyncBlob): Promise<void>;

  listReviews(placeId: string): Promise<CloudReview[]>;
  saveReview(review: NewReview): Promise<CloudReview>;
  deleteReview(id: string): Promise<void>;
  reportReview(id: string, reason: string): Promise<void>;

  /** Replaces this user's published trip dates. An empty list hides the user from others. */
  publishTrip(windows: TripWindow[]): Promise<void>;
  /** Other travellers whose published dates overlap this user's own published dates. */
  whoElseThere(): Promise<FellowTraveler[]>;

  /** Current posts on the board (signed-in users only), soonest first. */
  listPartnerPosts(): Promise<PartnerPost[]>;
  createPartnerPost(post: NewPartnerPost): Promise<PartnerPost>;
  deletePartnerPost(id: string): Promise<void>;
  /** A private answer that only the post's author and the replier can read. One per post. */
  replyToPartnerPost(postId: string, text: string): Promise<void>;
  /** Replies this user can read: answers to their own posts and their own answers. */
  listPartnerReplies(): Promise<PartnerReply[]>;
  deletePartnerReply(id: string): Promise<void>;
  reportPartnerPost(id: string, reason: string): Promise<void>;

  /** Upcoming meetups (signed-in users only), soonest first. */
  listMeetups(): Promise<Meetup[]>;
  createMeetup(meetup: NewMeetup): Promise<Meetup>;
  deleteMeetup(id: string): Promise<void>;
  /** Say you are coming, or take it back. */
  setGoing(id: string, going: boolean): Promise<void>;
  reportMeetup(id: string, reason: string): Promise<void>;

  /** True for users listed in public.moderators (set from the dashboard). */
  isModerator(): Promise<boolean>;
  /** Hidden or reported reviews and partner posts, hidden first. Moderators only. */
  moderationQueue(): Promise<ModItem[]>;
  moderate(kind: ModKind, id: string, action: ModAction): Promise<void>;
}

/** The database (0004_hardening.sql) accepts at most 15 current stops. */
export const MAX_TRIP_WINDOWS = 15;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Keeps only well-formed stops that have not ended yet (the database applies the same rules),
 * at most MAX_TRIP_WINDOWS.
 */
export function cleanTripWindows(windows: TripWindow[], today = new Date().toISOString().slice(0, 10)): TripWindow[] {
  return windows
    .filter((w) => /^[a-z-]{2,40}$/.test(w.countryId) && ISO_DAY.test(w.from) && ISO_DAY.test(w.to) && w.from <= w.to && w.to >= today)
    .slice(0, MAX_TRIP_WINDOWS);
}

export const windowsOverlap = (a: TripWindow, b: TripWindow) => a.countryId === b.countryId && a.from <= b.to && b.from <= a.to;
