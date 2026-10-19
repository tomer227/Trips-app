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

/** useState that persists to localStorage, falling back to memory if storage is unavailable. */
export function usePersistentState<T>(key: string, initial: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? initial : (JSON.parse(raw) as T);
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
