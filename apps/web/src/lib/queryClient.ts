import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { defaultShouldDehydrateMutation, QueryClient } from '@tanstack/react-query';
import {
  persistQueryClientSave,
  type PersistedClient,
  type Persister,
  type PersistQueryClientProviderProps,
} from '@tanstack/react-query-persist-client';
import {
  isFailedUnwatchedSave,
  keepFailedUnwatchedSaves,
  queryKeys,
  restoredMutationMeta,
  saveMealOptions,
} from '../features/data/queries.ts';

/** Cached places and meals are good enough for a lunch pick for a day. */
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** Bump when a cached query's shape changes so old caches are dropped. */
const CACHE_BUSTER = 'v2';
const CACHE_KEY = 'lunch-query-cache';

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

// A save paused offline is persisted without its functions. Registered before the cache is
// restored, these defaults let it run when the app is opened again.
queryClient.setMutationDefaults(saveMealOptions.mutationKey, saveMealOptions);
// A save that fails after the home screen was left is kept for the notice there.
keepFailedUnwatchedSaves(queryClient);

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

const storage = browserStorage();
const throttledPersister = createSyncStoragePersister({ storage, key: CACHE_KEY, throttleTime: 1000 });
/** The newest snapshot handed to the persister, possibly still waiting out the throttle. */
let unflushed: PersistedClient | undefined;

const persister: Persister = {
  persistClient: (client) => {
    unflushed = client;
    return throttledPersister.persistClient(client);
  },
  restoreClient: () => throttledPersister.restoreClient(),
  removeClient: () => {
    unflushed = undefined;
    return throttledPersister.removeClient();
  },
};

/**
 * Writes the newest snapshot at once. Without this, a reload or a closed tab inside the
 * throttle window restores the cache from before the last change, e.g. the meal list
 * without the meal just saved, or without the save queued offline.
 */
function flushPersistedCache(): void {
  if (!storage || !unflushed) return;
  try {
    storage.setItem(CACHE_KEY, JSON.stringify(unflushed));
    unflushed = undefined;
  } catch {
    // Quota or blocked storage: the throttled write still runs if the page stays.
  }
}

window.addEventListener('pagehide', flushPersistedCache);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushPersistedCache();
});

export const persistOptions: PersistQueryClientProviderProps['persistOptions'] = {
  persister,
  maxAge: CACHE_MAX_AGE_MS,
  buster: CACHE_BUSTER,
  hydrateOptions: {
    defaultOptions: {
      // No screen watches a restored mutation. The mark lets the home screen report a restored
      // save that fails, and the endless gcTime keeps that failure until the user acts on it.
      mutations: { meta: restoredMutationMeta, gcTime: Infinity },
    },
  },
  dehydrateOptions: {
    // The session is re-checked on every start, and team rooms are live, so neither is restored.
    shouldDehydrateQuery: (query) =>
      query.state.status === 'success' && query.queryKey[0] !== queryKeys.session[0] && query.queryKey[0] !== 'room',
    // Paused mutations, plus failed unwatched saves so their notice survives a reload.
    // Team room mutations are left out: they only make sense on the screen that started them.
    shouldDehydrateMutation: (mutation) =>
      mutation.options.mutationKey?.[0] !== 'room' && (defaultShouldDehydrateMutation(mutation) || isFailedUnwatchedSave(mutation)),
  },
};

/**
 * Sends the saves restored from the cache, e.g. a meal accepted offline before the tab was closed.
 * The provider only starts writing cache changes once this settles, so the outcome is written here.
 * Otherwise a save that failed would stay queued in storage and be sent again on the next start.
 */
export async function resumeRestoredMutations(): Promise<void> {
  await queryClient.resumePausedMutations();
  await persistQueryClientSave({ queryClient, ...persistOptions });
}
