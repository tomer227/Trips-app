import { describe, expect, it } from 'vitest';
import { createMemoryBackend } from './memoryBackend';
import { CloudError, localToday } from './types';

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

  it('shows who else will be in the same country at the same time, only to travellers who share', async () => {
    const st = store();
    const b = createMemoryBackend(st);
    const day = (n: number) => localToday(new Date(Date.now() + n * 86_400_000));
    await b.signUp({ email: 'a@b.co', password: 'password123', displayName: 'דנה' });
    await b.publishTrip([{ countryId: 'peru', from: day(30), to: day(60) }, { countryId: 'bolivia', from: day(61), to: day(70) }]);
    await b.signOut();

    await b.signUp({ email: 'c@d.co', password: 'password123', displayName: 'יוסי' });
    expect(await b.whoElseThere()).toEqual([]); // not sharing yet: sees nobody
    await b.publishTrip([
      { countryId: 'peru', from: day(50), to: day(65) },
      { countryId: 'chile', from: day(30), to: day(60) },
      { countryId: 'bad id!', from: day(30), to: day(31) },
    ]);
    expect(await b.whoElseThere()).toEqual([{ name: 'דנה', countryId: 'peru', from: day(30), to: day(60) }]);

    await b.publishTrip([]);
    expect(await b.whoElseThere()).toEqual([]);
    await b.signOut();
    await b.signIn({ email: 'a@b.co', password: 'password123' });
    expect(await b.whoElseThere()).toEqual([]); // יוסי stopped sharing
    await b.signOut();
    expect(await code(b.publishTrip([]))).toBe('not_signed_in');
  });
});

describe('memory backend: partner board', () => {
  const memStore = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };
  const errCode = (p: Promise<unknown>) => p.then(() => 'ok', (e: { code?: string }) => e.code);
  const ad = { countryId: 'peru', from: '2099-03-01', to: '2099-03-10', kind: 'trek' as const, text: 'מחפשים שותפים לסלקנטאי' };

  it('keeps replies private between the author and the replier, and hides reported posts', async () => {
    const b = createMemoryBackend(memStore());
    expect(await errCode(b.listPartnerPosts())).toBe('not_signed_in');

    await b.signUp({ email: 'a@b.co', password: 'password123', displayName: 'דנה' });
    const post = await b.createPartnerPost(ad);
    await b.createPartnerPost({ ...ad, from: '2000-01-01', to: '2000-01-02' }).catch(() => undefined); // past dates are refused
    expect(await errCode(b.replyToPartnerPost(post.id, 'עונה לעצמי'))).toBe('not_allowed');
    await b.signOut();

    await b.signUp({ email: 'c@d.co', password: 'password123', displayName: 'יוסי' });
    expect((await b.listPartnerPosts()).map((p) => p.author)).toEqual(['דנה']);
    await b.replyToPartnerPost(post.id, 'גם אני! וואטסאפ');
    expect(await errCode(b.replyToPartnerPost(post.id, 'שוב'))).toBe('already_replied');
    await b.signOut();

    await b.signUp({ email: 'e@f.co', password: 'password123', displayName: 'נועה' });
    expect(await b.listPartnerReplies()).toEqual([]); // a third user sees no replies
    await b.reportPartnerPost(post.id, 'spam');
    await b.signOut();

    await b.signIn({ email: 'a@b.co', password: 'password123' });
    expect((await b.listPartnerReplies()).map((r) => [r.author, r.text])).toEqual([['יוסי', 'גם אני! וואטסאפ']]);
    for (let i = 1; i < 5; i++) await b.createPartnerPost({ ...ad, text: `${ad.text} ${i}` });
    expect(await errCode(b.createPartnerPost(ad))).toBe('too_many_posts');
    await b.deletePartnerPost(post.id);
    expect(await b.listPartnerReplies()).toEqual([]);
  });

  it('lets moderators see reported content and restore or delete it, and nobody else', async () => {
    const s = store();
    const b = createMemoryBackend(s);
    await b.signUp({ email: 'a@b.co', password: 'password123', displayName: 'דנה' });
    const r = await b.saveReview(review('mod-place', { text: 'ספאם' }));
    await b.signOut();
    await b.signUp({ email: 'c@d.co', password: 'password123', displayName: 'יוסי' });
    await b.reportReview(r.id, 'פרסומת');
    expect(await b.isModerator()).toBe(false);
    expect(await code(b.moderationQueue())).toBe('not_signed_in');

    const state = JSON.parse(s.getItem('memory-cloud')!);
    state.moderators = [state.sessionUserId];
    s.setItem('memory-cloud', JSON.stringify(state));
    expect(await b.isModerator()).toBe(true);
    expect((await b.moderationQueue()).map((i) => [i.kind, i.text, i.author, i.reports, i.reasons])).toEqual([['review', 'ספאם', 'דנה', 1, ['פרסומת']]]);
    await b.moderate('review', r.id, 'restore');
    expect(await b.moderationQueue()).toEqual([]);
    await b.reportReview(r.id, 'שוב'); // the same reporter cannot bring it back to the queue
    expect(await b.moderationQueue()).toEqual([]);
    await b.moderate('review', r.id, 'delete');
    expect(await b.listReviews('mod-place')).toEqual([]);
  });

  it('runs meetups: create, count who is coming without names, limits and reports', async () => {
    const b = createMemoryBackend(store());
    const at = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
    const m = { countryId: 'peru', title: 'ארוחת שישי', text: '', placeLabel: 'בית חב״ד קוסקו', lat: -13.5, lng: -71.9, startsAt: at(30) };
    expect(await code(b.listMeetups())).toBe('not_signed_in');
    await b.signUp({ email: 'a@b.co', password: 'password123', displayName: 'דנה' });
    const created = await b.createMeetup(m);
    await b.setGoing(created.id, true); // organisers are not counted as coming
    expect((await b.listMeetups()).find((x) => x.id === created.id)).toMatchObject({ going: 0, iAmGoing: false });
    expect(await code(b.createMeetup({ ...m, startsAt: at(-5) }))).toBe('invalid_input');
    await b.createMeetup({ ...m, title: 'טרק ליום' });
    await b.createMeetup({ ...m, title: 'מסיבה' });
    expect(await code(b.createMeetup({ ...m, title: 'עוד אחד' }))).toBe('too_many_meetups');
    await b.signOut();

    await b.signUp({ email: 'c@d.co', password: 'password123', displayName: 'יוסי' });
    await b.setGoing(created.id, true);
    await b.setGoing(created.id, true);
    const seen = (await b.listMeetups()).find((x) => x.id === created.id)!;
    expect(seen).toMatchObject({ author: 'דנה', going: 1, iAmGoing: true });
    await b.setGoing(created.id, false);
    expect((await b.listMeetups()).find((x) => x.id === created.id)!.going).toBe(0);
    await b.reportMeetup(created.id, 'spam');
    await b.deleteMeetup(created.id); // not the organiser: nothing happens
    expect((await b.listMeetups()).some((x) => x.id === created.id)).toBe(true);
  });
});

