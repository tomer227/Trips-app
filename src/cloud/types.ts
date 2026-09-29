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
}
