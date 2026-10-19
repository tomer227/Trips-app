import { subscribeStorageChanges } from '../storage';
import type { CloudBackend, CloudUser, SyncBlob, SyncEntry, SyncKey } from './types';

/**
 * Private data sync: trip plan, checklist, journal, saved places and the user's own places.
 * Reviews are shared separately; check-ins and photos never leave the device.
 *
 * Model: each key carries the time of its last change. The newest side wins per key. On the first
 * sync of an account on a device, lists are merged instead (so data written before signing up is
 * not lost). Known limit: without per-item timestamps, a deletion made on one device can be undone
 * by another device that still has the item and syncs later.
 */

export const SYNC_KEYS: SyncKey[] = ['tripPlan', 'checklist', 'journal', 'saved', 'customPlaces'];

export interface KV {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const STORAGE_KEYS = { tripPlan: 'trip-plan', checklist: 'checklist', journal: 'journal', community: 'community' } as const;
const META_KEY = 'sync-meta';

/* ─── Values ─── */

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export function isEmptyValue(key: SyncKey, value: unknown): boolean {
  switch (key) {
    case 'tripPlan':
      return !isObj(value) || arr(value.stops).length === 0;
    case 'checklist':
      return !isObj(value) || !Object.values(value).some(Boolean);
    case 'journal':
      return !isObj(value) || (arr(value.entries).length === 0 && arr(value.expenses).length === 0);
    default:
      return arr(value).length === 0;
  }
}

const MERGEABLE: SyncKey[] = ['checklist', 'journal', 'saved', 'customPlaces'];

const unionById = (a: unknown[], b: unknown[]): unknown[] => {
  const seen = new Set<unknown>();
  const out: unknown[] = [];
  for (const item of [...a, ...b]) {
    const id = isObj(item) ? item.id : item;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(item);
  }
  return out;
};

/** Merges two values of the same key. `a` wins where both have the same item. */
export function unionValue(key: SyncKey, a: unknown, b: unknown): unknown {
  switch (key) {
    case 'saved':
      return [...new Set([...arr(a), ...arr(b)])];
    case 'customPlaces':
      return unionById(arr(a), arr(b));
    case 'journal': {
      const ja = isObj(a) ? a : {};
      const jb = isObj(b) ? b : {};
      return { entries: unionById(arr(ja.entries), arr(jb.entries)), expenses: unionById(arr(ja.expenses), arr(jb.expenses)) };
    }
    case 'checklist': {
      const out: Record<string, boolean> = {};
      for (const src of [a, b]) if (isObj(src)) for (const [k, v] of Object.entries(src)) out[k] = out[k] || Boolean(v);
      return out;
    }
    default:
      return a;
  }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/* ─── Planning (pure) ─── */

export interface PlanResult {
  /** Values to write to this device */
  apply: Partial<Record<SyncKey, unknown>>;
  /** What the cloud should hold after the sync */
  blob: SyncBlob;
  push: boolean;
}

export function planSync(local: Partial<Record<SyncKey, SyncEntry>>, remote: SyncBlob | null, firstSync: boolean, now: string): PlanResult {
  const apply: PlanResult['apply'] = {};
  const keys: SyncBlob['keys'] = {};
  let push = false;

  for (const key of SYNC_KEYS) {
    const l = local[key];
    const r = remote?.keys[key];
    const lEmpty = !l || isEmptyValue(key, l.value);
    const rEmpty = !r || isEmptyValue(key, r.value);

    if (lEmpty && rEmpty) continue;

    if (rEmpty) {
      // The cloud has nothing (or was emptied earlier than our data): send ours.
      keys[key] = l!;
      push = true;
    } else if (lEmpty) {
      // We emptied this key after the cloud copy was written: that is a deliberate deletion.
      if (l?.at && l.at > r!.at) {
        keys[key] = l;
        push = true;
      } else {
        keys[key] = r!;
        apply[key] = r!.value;
      }
    } else if (firstSync && MERGEABLE.includes(key)) {
      const value = unionValue(key, l!.value, r!.value);
      keys[key] = { at: now, value };
      if (!same(value, l!.value)) apply[key] = value;
      if (!same(value, r!.value)) push = true;
    } else if (r!.at > (l!.at ?? '')) {
      keys[key] = r!;
      if (!same(r!.value, l!.value)) apply[key] = r!.value;
    } else {
      keys[key] = l!;
      if (!same(l!.value, r!.value)) push = true;
    }
  }

  return { apply, blob: { v: 1, keys }, push };
}

/* ─── Local storage adapters ─── */

const parse = (raw: string | null): unknown => {
  try {
    return raw === null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
};

export function readSnapshot(storage: KV): Record<SyncKey, unknown> {
  const community = parse(storage.getItem(STORAGE_KEYS.community));
  const c = isObj(community) ? community : {};
  return {
    tripPlan: parse(storage.getItem(STORAGE_KEYS.tripPlan)),
    checklist: parse(storage.getItem(STORAGE_KEYS.checklist)),
    journal: parse(storage.getItem(STORAGE_KEYS.journal)),
    saved: arr(c.saved),
    customPlaces: arr(c.customPlaces),
  };
}

/** Writes values received from the cloud. Uses raw storage so it is not mistaken for a local edit. */
export function writeSnapshotKeys(storage: KV, values: Partial<Record<SyncKey, unknown>>): void {
  const community = parse(storage.getItem(STORAGE_KEYS.community));
  const c: Record<string, unknown> = isObj(community) ? { ...community } : {};
  let communityChanged = false;
  for (const [key, value] of Object.entries(values) as [SyncKey, unknown][]) {
    if (key === 'saved' || key === 'customPlaces') {
      c[key] = value;
      communityChanged = true;
    } else {
      storage.setItem(STORAGE_KEYS[key], JSON.stringify(value));
    }
  }
  if (communityChanged) storage.setItem(STORAGE_KEYS.community, JSON.stringify(c));
}

/** Removes the synced data from this device (used on sign-out so the next person on it sees none). */
export function wipeSyncedData(storage: KV): void {
  for (const k of [STORAGE_KEYS.tripPlan, STORAGE_KEYS.checklist, STORAGE_KEYS.journal, META_KEY]) storage.removeItem(k);
  const community = parse(storage.getItem(STORAGE_KEYS.community));
  if (isObj(community)) storage.setItem(STORAGE_KEYS.community, JSON.stringify({ ...community, saved: [], customPlaces: [] }));
}

interface Meta {
  userId?: string;
  at: Partial<Record<SyncKey, string>>;
  hashes: Partial<Record<SyncKey, string>>;
}

function readMeta(storage: KV): Meta {
  const m = parse(storage.getItem(META_KEY));
  return isObj(m) ? { userId: typeof m.userId === 'string' ? m.userId : undefined, at: isObj(m.at) ? (m.at as Meta['at']) : {}, hashes: isObj(m.hashes) ? (m.hashes as Meta['hashes']) : {} } : { at: {}, hashes: {} };
}

/* ─── Engine ─── */

export type SyncState = 'idle' | 'syncing' | 'error';

export interface SyncStatus {
  state: SyncState;
  lastSyncedAt?: number;
  error?: string;
}

export interface SyncOutcome {
  applied: SyncKey[];
  pushed: boolean;
}

export interface SyncEngine {
  syncNow(): Promise<SyncOutcome>;
  stop(): void;
}

export interface SyncOptions {
  backend: CloudBackend;
  user: CloudUser;
  storage?: KV;
  now?: () => Date;
  debounceMs?: number;
  onStatus?: (status: SyncStatus) => void;
  /** Cloud data was written to this device. `initial` is true for the first sync after starting. */
  onRemoteApplied?: (keys: SyncKey[], initial: boolean) => void;
}

export function startSync(options: SyncOptions): SyncEngine {
  const { backend, user, onStatus, onRemoteApplied } = options;
  const storage = options.storage ?? localStorage;
  const now = options.now ?? (() => new Date());
  const debounceMs = options.debounceMs ?? 2000;

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let chain: Promise<unknown> = Promise.resolve();
  let first = true;
  let status: SyncStatus = { state: 'idle' };
  const setStatus = (s: SyncStatus) => {
    status = s;
    onStatus?.(s);
  };

  /** Notices edits made on this device since the last look, and stamps them with the time. */
  function detectLocalChanges(meta: Meta): Partial<Record<SyncKey, unknown>> {
    const snapshot = readSnapshot(storage);
    for (const key of SYNC_KEYS) {
      const hash = JSON.stringify(snapshot[key] ?? null);
      if (meta.hashes[key] === undefined) meta.hashes[key] = hash; // first look: nothing to stamp
      else if (meta.hashes[key] !== hash) {
        meta.hashes[key] = hash;
        meta.at[key] = now().toISOString();
      }
    }
    return snapshot;
  }

  async function runSync(): Promise<SyncOutcome> {
    const meta = readMeta(storage);
    const firstForAccount = meta.userId !== user.id;
    const snapshot = detectLocalChanges(meta);
    const local: Partial<Record<SyncKey, SyncEntry>> = {};
    for (const key of SYNC_KEYS) if (snapshot[key] !== undefined) local[key] = { at: meta.at[key] ?? '', value: snapshot[key] };

    setStatus({ ...status, state: 'syncing', error: undefined });
    const remote = await backend.loadUserData();
    const plan = planSync(local, remote, firstForAccount, now().toISOString());

    const applied = Object.keys(plan.apply) as SyncKey[];
    if (applied.length) {
      writeSnapshotKeys(storage, plan.apply);
      for (const key of applied) {
        meta.hashes[key] = JSON.stringify(plan.apply[key] ?? null);
        meta.at[key] = plan.blob.keys[key]?.at ?? now().toISOString();
      }
    }
    if (plan.push) await backend.saveUserData(plan.blob);

    meta.userId = user.id;
    storage.setItem(META_KEY, JSON.stringify(meta));
    setStatus({ state: 'idle', lastSyncedAt: now().getTime() });
    return { applied, pushed: plan.push };
  }

  const enqueue = (): Promise<SyncOutcome> => {
    const run = chain.then(async () => {
      if (stopped) return { applied: [], pushed: false };
      try {
        const outcome = await runSync();
        if (outcome.applied.length) onRemoteApplied?.(outcome.applied, first);
        first = false;
        return outcome;
      } catch (e) {
        setStatus({ ...status, state: 'error', error: e instanceof Error ? e.message : 'sync failed' });
        throw e;
      }
    });
    chain = run.catch(() => undefined);
    return run;
  };

  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void enqueue().catch(() => undefined), debounceMs);
  };

  const unsubscribe = subscribeStorageChanges((key) => {
    if (key === STORAGE_KEYS.tripPlan || key === STORAGE_KEYS.checklist || key === STORAGE_KEYS.journal || key === STORAGE_KEYS.community) schedule();
  });
  const onOnline = () => schedule();
  if (typeof window !== 'undefined') window.addEventListener('online', onOnline);

  return {
    syncNow: enqueue,
    stop() {
      stopped = true;
      clearTimeout(timer);
      unsubscribe();
      if (typeof window !== 'undefined') window.removeEventListener('online', onOnline);
    },
  };
}
