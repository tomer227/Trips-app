import { describe, expect, it } from 'vitest';
import { createMemoryBackend } from './memoryBackend';
import { CloudError } from './types';

const store = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};
const code = async (p: Promise<unknown>) => (await p.then(() => 'ok', (e) => (e as CloudError).code));
const review = (placeId: string, over = {}) => ({ placeId, stars: 4, text: 'טוב', visited: '2026-01', tags: ['vibe'], ...over });

describe('memory backend', () => {
  it('signs up, out and in, with the same rules as the real service', async () => {
    const b = createMemoryBackend(store());
    expect(await b.getUser()).toBeNull();
    expect(await code(b.signUp({ email: 'nope', password: 'password123', displayName: 'דנה' }))).toBe('invalid_email');
    expect(await code(b.signUp({ email: 'a@b.co', password: 'short', displayName: 'דנה' }))).toBe('weak_password');
    expect(await code(b.signUp({ email: 'a@b.co', password: 'password123', displayName: 'ד' }))).toBe('invalid_name');

    const { user, needsConfirmation } = await b.signUp({ email: 'A@B.co', password: 'password123', displayName: ' דנה ' });
    expect(needsConfirmation).toBe(false);
    expect(user).toMatchObject({ email: 'a@b.co', displayName: 'דנה' });
    expect(await code(b.signUp({ email: 'a@b.co', password: 'password123', displayName: 'אחר' }))).toBe('email_taken');

    await b.signOut();
    expect(await b.getUser()).toBeNull();
    expect(await code(b.signIn({ email: 'a@b.co', password: 'wrong-password' }))).toBe('invalid_credentials');
    expect((await b.signIn({ email: 'a@b.co', password: 'password123' })).displayName).toBe('דנה');
  });

  it('notifies listeners of auth changes', async () => {
    const b = createMemoryBackend(store());
    const events: string[] = [];
    const off = b.onAuthChange((u, e) => events.push(`${e}:${u?.displayName ?? '-'}`));
    await b.signUp({ email: 'a@b.co', password: 'password123', displayName: 'דנה' });
    await b.signOut();
    off();
    await b.signIn({ email: 'a@b.co', password: 'password123' });
    expect(events).toEqual(['SIGNED_IN:דנה', 'SIGNED_OUT:-']);
  });

  it('keeps private data per user', async () => {
    const s = store();
    const b = createMemoryBackend(s);
    await b.signUp({ email: 'a@b.co', password: 'password123', displayName: 'דנה' });
    await b.saveUserData({ v: 1, keys: { saved: { at: 't', value: ['x'] } } });
    expect((await b.loadUserData())?.keys.saved?.value).toEqual(['x']);
    await b.signOut();
    expect(await code(b.loadUserData())).toBe('not_signed_in');
    await b.signUp({ email: 'c@d.co', password: 'password123', displayName: 'יוסי' });
    expect(await b.loadUserData()).toBeNull();
  });

  it('shares reviews: one per user and place, edits replace, only the author deletes', async () => {
    const b = createMemoryBackend(store());
    await b.signUp({ email: 'a@b.co', password: 'password123', displayName: 'דנה' });
    const first = await b.saveReview(review('kasol'));
    const edited = await b.saveReview(review('kasol', { stars: 5 }));
    expect(edited.id).toBe(first.id);
    expect(await b.listReviews('kasol')).toHaveLength(1);
    await b.signOut();

    // Anyone can read; nobody but the author can write or delete.
    expect((await b.listReviews('kasol'))[0]).toMatchObject({ stars: 5, author: 'דנה' });
    expect(await code(b.saveReview(review('kasol')))).toBe('not_signed_in');
    await b.signUp({ email: 'c@d.co', password: 'password123', displayName: 'יוסי' });
    await b.deleteReview(first.id);
    expect(await b.listReviews('kasol')).toHaveLength(1);
  });

  it('hides a review after three different reporters', async () => {
    const b = createMemoryBackend(store());
    await b.signUp({ email: 'a@b.co', password: 'password123', displayName: 'דנה' });
    const { id } = await b.saveReview(review('kasol'));
    for (const n of ['1', '2', '3']) {
      await b.signOut();
      await b.signUp({ email: `r${n}@b.co`, password: 'password123', displayName: `מדווח ${n}` });
      await b.reportReview(id, 'spam');
      await b.reportReview(id, 'again'); // the same user twice counts once
      expect(await b.listReviews('kasol')).toHaveLength(n === '3' ? 0 : 1);
    }
  });

  it('renames an author on their reviews and deletes an account with everything attached', async () => {
    const b = createMemoryBackend(store());
    await b.signUp({ email: 'a@b.co', password: 'password123', displayName: 'דנה' });
    await b.saveReview(review('kasol'));
    await b.updateDisplayName('דנה הטיילת');
    expect((await b.listReviews('kasol'))[0].author).toBe('דנה הטיילת');
    expect(await code(b.updateDisplayName('x'))).toBe('invalid_name');
    await b.deleteAccount();
    expect(await b.getUser()).toBeNull();
    expect(await b.listReviews('kasol')).toEqual([]);
    expect(await code(b.signIn({ email: 'a@b.co', password: 'password123' }))).toBe('invalid_credentials');
  });
});
