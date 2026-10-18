import { createClient, type User } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
if (!url || !anonKey) {
  throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set (see apps/web/.env.example)');
}

function attempt<T>(action: () => T): T | null {
  try {
    return action();
  } catch {
    return null;
  }
}

/**
 * localStorage with an in-memory copy of everything this page wrote. supabase-js reads the
 * session from storage before every request and sends the anon key when the read comes back
 * empty. On an iPhone opened from the QR code, a save right after sign-up went out that way
 * and RLS rejected it (production, 2026-10-16), so a session this page received is kept.
 */
function authStorage() {
  const memory = new Map<string, string>();
  return {
    getItem: (key: string) => attempt(() => window.localStorage.getItem(key)) ?? memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
      attempt(() => window.localStorage.setItem(key, value));
    },
    removeItem: (key: string) => {
      memory.delete(key);
      attempt(() => window.localStorage.removeItem(key));
    },
  };
}

export const supabase = createClient(url, anonKey, { auth: { storage: authStorage() } });

let pending: Promise<User> | null = null;

/** Returns the signed-in user, signing in anonymously on the first visit. */
export function ensureSession(): Promise<User> {
  pending ??= (async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) return data.session.user;
    const { data: signIn, error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
    if (!signIn.user) throw new Error('Anonymous sign-in returned no user');
    return signIn.user;
  })().catch((error: unknown) => {
    pending = null;
    throw error;
  });
  return pending;
}

/** Forget the memoized session after the signed-in user changes. */
export function forgetSession(): void {
  pending = null;
}

/**
 * Makes sure the next request carries a user token. If the session is gone (for example the
 * browser cleared its storage and this page was reloaded), signs in again rather than letting
 * a write go out as anon and fail RLS.
 */
export async function requireSession(): Promise<void> {
  if ((await supabase.auth.getSession()).data.session) return;
  // A first-visit sign-in may still be running; signing in again would make a second user.
  if (pending) {
    await pending.catch(() => undefined);
    if ((await supabase.auth.getSession()).data.session) return;
  }
  forgetSession();
  await ensureSession();
}
