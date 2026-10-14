import { createClient, type User } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
if (!url || !anonKey) {
  throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set (see apps/web/.env.example)');
}

export const supabase = createClient(url, anonKey);

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
