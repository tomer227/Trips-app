import { describe, expect, it, vi } from 'vitest';
import { createMemoryBackend } from './memoryBackend';
import { SYNC_KEYS, isEmptyValue, planSync, readSnapshot, startSync, unionValue, wipeSyncedData, writeSnapshotKeys, type KV } from './sync';
import type { SyncBlob, SyncEntry } from './types';
import { notifyStorageChange } from '../storage';

class FakeKV implements KV {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  json(k: string) {
    const raw = this.m.get(k);
    return raw ? JSON.parse(raw) : undefined;
  }
}

const plan = (...countries: string[]) => ({ stops: countries.map((countryId) => ({ countryId, days: 10 })), style: 'low', flightsUsd: 1200, insurancePerMonthUsd: 100 });
const entry = (value: unknown, at: string): SyncEntry => ({ at, value });
const NOW = '2026-06-01T00:00:00.000Z';

describe('isEmptyValue', () => {
  it('treats defaults as empty and real content as non-empty', () => {
    expect(isEmptyValue('tripPlan', plan())).toBe(true);
    expect(isEmptyValue('tripPlan', undefined)).toBe(true);
    expect(isEmptyValue('tripPlan', plan('peru'))).toBe(false);
    expect(isEmptyValue('checklist', { a: false })).toBe(true);
    expect(isEmptyValue('checklist', { a: true })).toBe(false);
    expect(isEmptyValue('journal', { entries: [], expenses: [] })).toBe(true);
    expect(isEmptyValue('journal', { entries: [{ id: '1' }], expenses: [] })).toBe(false);
    expect(isEmptyValue('saved', [])).toBe(true);
    expect(isEmptyValue('customPlaces', [{ id: 'c' }])).toBe(false);
  });
});

describe('unionValue', () => {
  it('merges lists by id and keeps the first side on ties', () => {
    expect(unionValue('saved', ['a', 'b'], ['b', 'c'])).toEqual(['a', 'b', 'c']);
    expect(unionValue('customPlaces', [{ id: '1', name: 'local' }], [{ id: '1', name: 'remote' }, { id: '2' }])).toEqual([{ id: '1', name: 'local' }, { id: '2' }]);
    expect(unionValue('journal', { entries: [{ id: 'e1' }], expenses: [] }, { entries: [{ id: 'e2' }], expenses: [{ id: 'x1' }] })).toEqual({
      entries: [{ id: 'e1' }, { id: 'e2' }],
      expenses: [{ id: 'x1' }],
    });
    expect(unionValue('checklist', { a: true, b: false }, { b: true, c: false })).toEqual({ a: true, b: true, c: false });
  });
});

describe('planSync', () => {
  it('pushes local data when the cloud is empty, and applies cloud data to an empty device', () => {
    const local = { tripPlan: entry(plan('peru'), '2026-01-01T00:00:00Z') };
    const up = planSync(local, null, true, NOW);
    expect(up.push).toBe(true);
    expect(up.apply).toEqual({});
    expect(up.blob.keys.tripPlan?.value).toEqual(plan('peru'));

    const down = planSync({}, up.blob, true, NOW);
    expect(down.push).toBe(false);
    expect(down.apply.tripPlan).toEqual(plan('peru'));
  });

  it('lets the newer side win per key after the first sync', () => {
    const remote: SyncBlob = { v: 1, keys: { tripPlan: entry(plan('peru'), '2026-02-01T00:00:00Z'), checklist: entry({ passport: true }, '2026-01-01T00:00:00Z') } };
    const local = { tripPlan: entry(plan('chile'), '2026-01-01T00:00:00Z'), checklist: entry({ passport: true, insurance: true }, '2026-03-01T00:00:00Z') };
    const res = planSync(local, remote, false, NOW);
    expect(res.apply).toEqual({ tripPlan: plan('peru') }); // cloud is newer
    expect(res.blob.keys.checklist?.value).toEqual({ passport: true, insurance: true }); // device is newer
    expect(res.push).toBe(true);
  });

  it('does nothing when both sides already agree', () => {
    const blob: SyncBlob = { v: 1, keys: { tripPlan: entry(plan('peru'), '2026-01-01T00:00:00Z') } };
    const res = planSync({ tripPlan: entry(plan('peru'), '2026-01-01T00:00:00Z') }, blob, false, NOW);
    expect(res.apply).toEqual({});
    expect(res.push).toBe(false);
  });

  it('merges lists on the first sync of an account so nothing written before signing up is lost', () => {
    const remote: SyncBlob = { v: 1, keys: { saved: entry(['cloud-place'], '2026-05-01T00:00:00Z'), journal: entry({ entries: [{ id: 'c1' }], expenses: [] }, '2026-05-01T00:00:00Z') } };
    const local = { saved: entry(['local-place'], '2026-01-01T00:00:00Z'), journal: entry({ entries: [{ id: 'l1' }], expenses: [] }, '2026-01-01T00:00:00Z') };
    const res = planSync(local, remote, true, NOW);
    expect(res.apply.saved).toEqual(['local-place', 'cloud-place']);
    expect((res.apply.journal as { entries: unknown[] }).entries).toEqual([{ id: 'l1' }, { id: 'c1' }]);
    expect(res.push).toBe(true);
    expect(res.blob.keys.saved?.at).toBe(NOW);
  });

  it('propagates a deliberate deletion, but a fresh device does not wipe the cloud', () => {
    const remote: SyncBlob = { v: 1, keys: { journal: entry({ entries: [{ id: 'e' }], expenses: [] }, '2026-01-01T00:00:00Z') } };
    const deleted = planSync({ journal: entry({ entries: [], expenses: [] }, '2026-02-01T00:00:00Z') }, remote, false, NOW);
    expect(deleted.push).toBe(true);
    expect(deleted.blob.keys.journal?.value).toEqual({ entries: [], expenses: [] });
    expect(deleted.apply.journal).toBeUndefined();

    const fresh = planSync({ journal: entry({ entries: [], expenses: [] }, '') }, remote, false, NOW);
    expect(fresh.push).toBe(false);
    expect(fresh.apply.journal).toEqual({ entries: [{ id: 'e' }], expenses: [] });
  });
});

describe('local storage adapters', () => {
  it('read and write the community-backed keys without touching reviews or check-ins', () => {
    const kv = new FakeKV();
    kv.setItem('community', JSON.stringify({ customPlaces: [{ id: 'c1' }], reviews: [{ id: 'r1' }], checkIn: { placeId: 'p', at: 1 }, saved: ['s1'] }));
    expect(readSnapshot(kv)).toMatchObject({ saved: ['s1'], customPlaces: [{ id: 'c1' }] });

    writeSnapshotKeys(kv, { saved: ['s2'], tripPlan: plan('peru') });
    expect(kv.json('community')).toEqual({ customPlaces: [{ id: 'c1' }], reviews: [{ id: 'r1' }], checkIn: { placeId: 'p', at: 1 }, saved: ['s2'] });
    expect(kv.json('trip-plan')).toEqual(plan('peru'));
  });

  it('wipes only the synced data, keeping device-only reviews', () => {
    const kv = new FakeKV();
    kv.setItem('trip-plan', '{}');
    kv.setItem('journal', '{}');
    kv.setItem('checklist', '{}');
    kv.setItem('sync-meta', '{}');
    kv.setItem('community', JSON.stringify({ customPlaces: [{ id: 'c1' }], reviews: [{ id: 'r1' }], saved: ['s1'] }));
    wipeSyncedData(kv);
    for (const k of ['trip-plan', 'journal', 'checklist', 'sync-meta']) expect(kv.getItem(k)).toBeNull();
    expect(kv.json('community')).toEqual({ customPlaces: [], reviews: [{ id: 'r1' }], saved: [] });
  });
});

describe('sync engine', () => {
  const setup = async () => {
    const cloudStore = new FakeKV(); // the "server": one memory backend shared by both devices
    const backend = createMemoryBackend(cloudStore);
    const user = await backend.signUp({ email: 'dana@example.com', password: 'password123', displayName: 'דנה' });
    let t = Date.parse('2026-03-01T00:00:00Z');
    const clock = () => new Date((t += 60_000));
    const device = () => {
      const storage = new FakeKV();
      const applied: { keys: string[]; initial: boolean }[] = [];
      const engine = startSync({ backend, user: user.user!, storage, now: clock, debounceMs: 5, onRemoteApplied: (keys, initial) => applied.push({ keys, initial }) });
      return { storage, engine, applied };
    };
    return { backend, device };
  };

  it('moves data between two devices of the same account', async () => {
    const { backend, device } = await setup();
    const phone = device();
    phone.storage.setItem('trip-plan', JSON.stringify(plan('peru', 'bolivia')));
    phone.storage.setItem('journal', JSON.stringify({ entries: [{ id: 'e1', title: 'יום ראשון' }], expenses: [] }));
    phone.storage.setItem('community', JSON.stringify({ saved: ['kasol'], customPlaces: [], reviews: [], checkIn: null }));
    const first = await phone.engine.syncNow();
    expect(first.pushed).toBe(true);
    expect(Object.keys((await backend.loadUserData())!.keys).sort()).toEqual(['journal', 'saved', 'tripPlan']);

    const laptop = device();
    const second = await laptop.engine.syncNow();
    expect(second.applied.sort()).toEqual(['journal', 'saved', 'tripPlan']);
    expect(laptop.applied).toEqual([{ keys: expect.arrayContaining(['tripPlan']), initial: true }]);
    expect(laptop.storage.json('trip-plan')).toEqual(plan('peru', 'bolivia'));
    expect(laptop.storage.json('community').saved).toEqual(['kasol']);
    phone.engine.stop();
    laptop.engine.stop();
  });

  it('pushes a later edit after the debounce, and the other device picks it up as a non-initial change', async () => {
    const { device } = await setup(); // sign-up uses real timers, so do it before faking them
    vi.useFakeTimers();
    try {
      const phone = device();
      phone.storage.setItem('trip-plan', JSON.stringify(plan('peru')));
      await phone.engine.syncNow();
      const laptop = device();
      await laptop.engine.syncNow();

      phone.storage.setItem('trip-plan', JSON.stringify(plan('peru', 'chile')));
      notifyStorageChange('trip-plan');
      await vi.advanceTimersByTimeAsync(20);

      // In this test both engines hear the same in-process event, so the laptop may already have synced.
      await laptop.engine.syncNow();
      expect(laptop.storage.json('trip-plan')).toEqual(plan('peru', 'chile'));
      expect(laptop.applied.at(-1)).toEqual({ keys: ['tripPlan'], initial: false });
      phone.engine.stop();
      laptop.engine.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not re-send unchanged data or treat downloaded data as a local edit', async () => {
    const { backend, device } = await setup();
    const phone = device();
    phone.storage.setItem('trip-plan', JSON.stringify(plan('peru')));
    await phone.engine.syncNow();
    const save = vi.spyOn(backend, 'saveUserData');

    expect((await phone.engine.syncNow()).pushed).toBe(false);
    const laptop = device();
    await laptop.engine.syncNow();
    expect((await laptop.engine.syncNow()).pushed).toBe(false);
    expect(save).not.toHaveBeenCalled();
    phone.engine.stop();
    laptop.engine.stop();
  });

  it('reports failures and keeps working afterwards', async () => {
    const { backend, device } = await setup();
    const phone = device();
    const load = vi.spyOn(backend, 'loadUserData').mockRejectedValueOnce(new Error('offline'));
    await expect(phone.engine.syncNow()).rejects.toThrow('offline');
    load.mockRestore();
    phone.storage.setItem('trip-plan', JSON.stringify(plan('peru')));
    await expect(phone.engine.syncNow()).resolves.toMatchObject({ pushed: true });
    phone.engine.stop();
  });

  it('exposes every synced key', () => {
    expect(SYNC_KEYS).toEqual(['tripPlan', 'checklist', 'journal', 'saved', 'customPlaces']);
  });
});
