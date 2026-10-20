import { useEffect, useState } from 'react';

type Listener = (key: string) => void;
const listeners = new Set<Listener>();

/** Lets the cloud sync layer learn that local data changed, without the UI knowing about it. */
export function subscribeStorageChanges(listener: Listener): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export function notifyStorageChange(key: string): void {
  listeners.forEach((l) => l(key));
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Stored data can be old, synced from another version of the app or edited by hand. A value of the
 * wrong shape falls back to the default instead of crashing the page, and objects get any fields
 * that were added since they were saved.
 */
export function sanitizeStored<T>(stored: unknown, initial: T): T {
  if (Array.isArray(initial)) return (Array.isArray(stored) ? stored : initial) as T;
  if (isPlainObject(initial)) {
    if (!isPlainObject(stored)) return initial;
    const merged: Record<string, unknown> = { ...initial, ...stored };
    // A field that should be a list or an object but is not falls back to its default.
    for (const [k, def] of Object.entries(initial)) {
      if (Array.isArray(def) && !Array.isArray(merged[k])) merged[k] = def;
      else if (isPlainObject(def) && !isPlainObject(merged[k])) merged[k] = def;
    }
    return merged as T;
  }
  if (initial === null) return (stored === null || isPlainObject(stored) ? stored : initial) as T;
  return (typeof stored === typeof initial ? stored : initial) as T;
}

/** useState that persists to localStorage, falling back to memory if storage is unavailable. */
export function usePersistentState<T>(key: string, initial: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? initial : sanitizeStored(JSON.parse(raw), initial);
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      const next = JSON.stringify(value);
      // Only real changes are written and announced; mounting with the stored value is a no-op.
      if (localStorage.getItem(key) !== next) {
        localStorage.setItem(key, next);
        notifyStorageChange(key);
      }
    } catch {
      // Private mode or storage full – keep working in memory.
    }
  }, [key, value]);

  return [value, setValue];
}
