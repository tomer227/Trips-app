import type { CloudBackend } from './types';

let backend: Promise<CloudBackend | null> | null = null;

/**
 * The account backend, created lazily so the Supabase client is only downloaded when accounts are
 * configured. Returns null when there is no configuration: the app then runs fully local, exactly
 * as before, and the account screen explains that accounts are not switched on yet.
 *
 *  - VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY  → Supabase (the anon key is public by design;
 *    Row Level Security in supabase/migrations protects the data).
 *  - VITE_CLOUD=memory                            → in-browser demo backend, for trying the UI.
 */
export function getCloudBackend(): Promise<CloudBackend | null> {
  backend ??= (async () => {
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    if (url && key) {
      const [{ createClient }, { createSupabaseBackend }] = await Promise.all([import('@supabase/supabase-js'), import('./supabaseBackend')]);
      // PKCE puts the confirmation code in the query string, which does not collide with our #/ routes.
      const client = createClient(url, key, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
      return createSupabaseBackend(client);
    }
    if (import.meta.env.VITE_CLOUD === 'memory') {
      const { createMemoryBackend } = await import('./memoryBackend');
      return createMemoryBackend();
    }
    return null;
  })();
  return backend;
}

export * from './types';
