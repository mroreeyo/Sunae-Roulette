import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { forgetSession, supabase } from '../../lib/supabase.ts';
import { queryKeys } from '../data/queries.ts';

/** Which user the persisted query cache belongs to. */
const CACHE_OWNER_KEY = 'lunch-cache-owner';

function readCacheOwner(): string | null {
  try {
    return localStorage.getItem(CACHE_OWNER_KEY);
  } catch {
    return null;
  }
}

function writeCacheOwner(userId: string | null): void {
  try {
    if (userId) localStorage.setItem(CACHE_OWNER_KEY, userId);
    else localStorage.removeItem(CACHE_OWNER_KEY);
  } catch {
    // Storage unavailable: nothing is persisted either, so there is nothing to protect.
  }
}

/**
 * Keeps the query cache in step with Supabase auth. When an email link signs this
 * browser into a different user (even on the first event of a fresh tab), every
 * cached query belongs to the old user, so the cache is reset. A confirmed email
 * only refreshes the user object.
 */
export function useAuthSync(): void {
  const client = useQueryClient();

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUserId = session?.user.id ?? null;
      const owner = readCacheOwner();
      writeCacheOwner(nextUserId);

      if (nextUserId !== null && owner !== null && owner !== nextUserId) {
        forgetSession();
        void client.resetQueries();
        return;
      }
      if (session) client.setQueryData(queryKeys.session, session.user);
    });
    return () => data.subscription.unsubscribe();
  }, [client]);
}
