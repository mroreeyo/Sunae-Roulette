import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { QueryClient } from '@tanstack/react-query';
import type { PersistQueryClientProviderProps } from '@tanstack/react-query-persist-client';
import { queryKeys } from '../features/data/queries.ts';

/** Cached places and meals are good enough for a lunch pick for a day. */
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** Bump when a cached query's shape changes so old caches are dropped. */
const CACHE_BUSTER = 'v1';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      gcTime: CACHE_MAX_AGE_MS,
      refetchOnWindowFocus: false,
      // Serve cached data first and pause fetches while offline instead of failing.
      networkMode: 'offlineFirst',
    },
  },
});

function browserStorage(): Storage | undefined {
  try {
    const storage = window.localStorage;
    storage.getItem('lunch-probe');
    return storage;
  } catch {
    // Private mode or blocked storage: the app still works, just without the cache.
    return undefined;
  }
}

export const persistOptions: PersistQueryClientProviderProps['persistOptions'] = {
  persister: createSyncStoragePersister({ storage: browserStorage(), key: 'lunch-query-cache', throttleTime: 1000 }),
  maxAge: CACHE_MAX_AGE_MS,
  buster: CACHE_BUSTER,
  dehydrateOptions: {
    // The session is re-checked on every start, so it is never restored from the cache.
    shouldDehydrateQuery: (query) => query.state.status === 'success' && query.queryKey[0] !== queryKeys.session[0],
  },
};
