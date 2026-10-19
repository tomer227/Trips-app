import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getCloudBackend } from './index';
import { startSync, wipeSyncedData, type SyncEngine, type SyncStatus } from './sync';
import type { CloudBackend, CloudUser } from './types';

export type AuthStatus = 'loading' | 'unconfigured' | 'out' | 'in';

export interface SignOutResult {
  ok: boolean;
  /** true when the last sync failed, so signing out now would lose recent changes */
  unsynced?: boolean;
}

interface AuthValue {
  status: AuthStatus;
  user: CloudUser | null;
  backend: CloudBackend | null;
  /** The user opened a password-reset link and must choose a new password */
  recovering: boolean;
  finishRecovery(): void;
  sync: SyncStatus;
  /** Another device changed the data while this one was open */
  updateAvailable: boolean;
  syncNow(): Promise<void>;
  /** Syncs one last time, then signs out and clears this device's synced data. */
  signOut(options?: { force?: boolean }): Promise<SignOutResult>;
  /** Called after the display name changes */
  setUser(user: CloudUser): void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** Full page reload, so every screen re-reads the (changed) local data. */
function restart(hash = '#/') {
  window.location.hash = hash;
  window.location.reload();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [backend, setBackend] = useState<CloudBackend | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<CloudUser | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [sync, setSync] = useState<SyncStatus>({ state: 'idle' });
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const engine = useRef<SyncEngine | null>(null);

  // Connect to the backend and follow sign-in / sign-out.
  useEffect(() => {
    let alive = true;
    let unsubscribe: (() => void) | undefined;
    getCloudBackend()
      .then(async (b) => {
        if (!alive) return;
        if (!b) {
          setStatus('unconfigured');
          return;
        }
        setBackend(b);
        unsubscribe = b.onAuthChange((u, event) => {
          if (!alive) return;
          setUser(u);
          setStatus(u ? 'in' : 'out');
          if (event === 'PASSWORD_RECOVERY') {
            setRecovering(true);
            window.location.hash = '#/account';
          }
        });
        try {
          const u = await b.getUser();
          if (alive) {
            setUser(u);
            setStatus(u ? 'in' : 'out');
          }
        } catch {
          if (alive) setStatus('out');
        }
      })
      .catch(() => alive && setStatus('unconfigured'));
    return () => {
      alive = false;
      unsubscribe?.();
    };
  }, []);

  // Keep the private data in sync while signed in.
  const userId = user?.id;
  useEffect(() => {
    if (!backend || !user) return;
    const e = startSync({
      backend,
      user,
      onStatus: setSync,
      onRemoteApplied: (_keys, initial) => {
        // Right after signing in, reload so screens pick up the cloud data. Later changes wait for the user.
        if (initial && !sessionStorage.getItem('sync-reloaded')) {
          sessionStorage.setItem('sync-reloaded', '1');
          window.location.reload();
        } else if (!initial) setUpdateAvailable(true);
      },
    });
    engine.current = e;
    e.syncNow().catch(() => undefined);
    return () => {
      e.stop();
      engine.current = null;
    };
    // The engine belongs to the account, not to changes of the display name.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend, userId]);

  const signOut = useCallback<AuthValue['signOut']>(
    async (options) => {
      if (!backend) return { ok: false };
      if (!options?.force) {
        try {
          await engine.current?.syncNow();
        } catch {
          return { ok: false, unsynced: true };
        }
      }
      engine.current?.stop();
      await backend.signOut();
      wipeSyncedData(localStorage);
      sessionStorage.removeItem('sync-reloaded');
      // Land on the account screen so it is obvious that the user is now signed out.
      restart('#/account');
      return { ok: true };
    },
    [backend],
  );

  const value = useMemo<AuthValue>(
    () => ({
      status,
      user,
      backend,
      recovering,
      finishRecovery: () => setRecovering(false),
      sync,
      updateAvailable,
      syncNow: async () => {
        await engine.current?.syncNow();
      },
      signOut,
      setUser,
    }),
    [status, user, backend, recovering, sync, updateAvailable, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
