import { addDays, toSeoulDate, type LatLng, type Meal, type Place, type PlacePref } from '@lunch/core';
import {
  hydrate,
  matchMutation,
  mutationOptions,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
  type Mutation,
  type MutationFilters,
  type QueryClient,
} from '@tanstack/react-query';
import { ensureSession, requireSession, supabase } from '../../lib/supabase.ts';

/** Cooldown used until the user changes it in settings (PRD default). */
export const DEFAULT_COOLDOWN_DAYS = 5;
/** Enough history for the 10-business-day fresh bonus and the 30-day stats. */
const HISTORY_CALENDAR_DAYS = 45;

export interface PlaceRow extends Place {
  address: string | null;
  source: 'public' | 'manual';
  /** Who added a manual place; only that user may edit or delete it. */
  createdBy: string | null;
}

export interface MealRow extends Meal {
  id: string;
  name: string;
}

interface PlaceRecord {
  id: string;
  name: string;
  category: string;
  lat: number | null;
  lng: number | null;
  address: string | null;
  source: 'public' | 'manual';
  created_by: string | null;
  is_active: boolean;
}

interface MealRecord {
  id: string;
  place_id: string;
  eaten_on: string;
  places: { name: string; category: string } | null;
}

export const queryKeys = {
  session: ['session'] as const,
  config: ['app_config'] as const,
  places: ['places'] as const,
  prefs: ['prefs'] as const,
  profile: ['profile'] as const,
  meals: ['meals'] as const,
};

export function useSession() {
  return useQuery({ queryKey: queryKeys.session, queryFn: ensureSession, staleTime: Infinity, retry: 1 });
}

function useSignedIn() {
  return useSession().isSuccess;
}

export function useAppConfig() {
  const enabled = useSignedIn();
  return useQuery({
    queryKey: queryKeys.config,
    enabled,
    staleTime: Infinity,
    queryFn: async (): Promise<{ baseName: string; base: LatLng; radiusM: number }> => {
      const { data, error } = await supabase
        .from('app_config')
        .select('base_name, base_lat, base_lng, radius_m')
        .single();
      if (error) throw error;
      return { baseName: data.base_name, base: { lat: data.base_lat, lng: data.base_lng }, radiusM: data.radius_m };
    },
  });
}

export function usePlaces() {
  const enabled = useSignedIn();
  return useQuery({
    queryKey: queryKeys.places,
    enabled,
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<PlaceRow[]> => {
      const { data, error } = await supabase
        .from('places')
        .select('id, name, category, lat, lng, address, source, created_by, is_active')
        .eq('is_active', true)
        .returns<PlaceRecord[]>();
      if (error) throw error;
      return data.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        lat: p.lat,
        lng: p.lng,
        address: p.address,
        source: p.source,
        createdBy: p.created_by,
        isActive: p.is_active,
      }));
    },
  });
}

export function usePrefs() {
  const enabled = useSignedIn();
  return useQuery({
    queryKey: queryKeys.prefs,
    enabled,
    queryFn: async (): Promise<PlacePref[]> => {
      const { data, error } = await supabase
        .from('user_place_prefs')
        .select('place_id, is_favorite, is_hidden, tags');
      if (error) throw error;
      return data.map((p) => ({
        placeId: p.place_id,
        isFavorite: p.is_favorite,
        isHidden: p.is_hidden,
        tags: p.tags ?? [],
      }));
    },
  });
}

export function useCooldownDays() {
  const enabled = useSignedIn();
  return useQuery({
    queryKey: queryKeys.profile,
    enabled,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.from('profiles').select('cooldown_days').maybeSingle();
      if (error) throw error;
      return data?.cooldown_days ?? DEFAULT_COOLDOWN_DAYS;
    },
  });
}

export function useRecentMeals() {
  const enabled = useSignedIn();
  return useQuery({
    queryKey: queryKeys.meals,
    enabled,
    queryFn: async (): Promise<MealRow[]> => {
      const since = addDays(toSeoulDate(new Date()), -HISTORY_CALENDAR_DAYS);
      const { data, error } = await supabase
        .from('meals')
        .select('id, place_id, eaten_on, places(name, category)')
        .gte('eaten_on', since)
        .order('eaten_on', { ascending: false })
        .returns<MealRecord[]>();
      if (error) throw error;
      return data.map((m) => ({
        id: m.id,
        placeId: m.place_id,
        eatenOn: m.eaten_on,
        name: m.places?.name ?? '알 수 없는 식당',
        category: m.places?.category ?? '기타',
      }));
    },
  });
}

export interface SaveMealInput {
  placeId: string;
  /** Seoul date of the tap, so a save queued offline keeps that day even if it runs later. */
  eatenOn: string;
  spinCount: number;
  decisionSeconds: number;
}

const saveMealKey = ['saveMeal'] as const;

/**
 * Set on every mutation restored from the persisted cache (see `lib/queryClient.ts`). No screen
 * watches a restored save, so the home screen reports the ones that fail.
 */
export const restoredMutationMeta = { restored: true } as const;

/** Set on a save that failed after the screen that made it was left, e.g. home was left while offline. */
const leftBehindSaveMeta = { leftBehind: true } as const;

const failedUnwatchedSaveFilters = {
  mutationKey: saveMealKey,
  status: 'error',
  predicate: (mutation) => mutation.meta?.restored === true || mutation.meta?.leftBehind === true,
} satisfies MutationFilters;

/** A save that failed with no screen showing it: resumed after a restart, or left behind by the home screen. */
export function isFailedUnwatchedSave(mutation: Mutation): boolean {
  return matchMutation(failedUnwatchedSaveFilters, mutation);
}

function removeFailedUnwatchedSaves(client: QueryClient, eatenOn: string): void {
  const cache = client.getMutationCache();
  for (const failed of cache.findAll(failedUnwatchedSaveFilters)) {
    if ((failed.state.variables as SaveMealInput | undefined)?.eatenOn === eatenOn) cache.remove(failed);
  }
}

/**
 * Keeps a save that fails while no screen watches it, so the home screen can report it. The result
 * card shows a save made on the home screen, but moving to another tab while it waits takes the card
 * away, and an unwatched failed mutation is garbage collected within minutes. Such a failure is put
 * back the way a restored one is: marked, and kept until the user retries or dismisses it.
 *
 * Mutations expose no observer count, so one is kept from the cache's observer events. A save that
 * fails in front of its result card is left alone; the card shows that error.
 */
export function keepFailedUnwatchedSaves(client: QueryClient): () => void {
  const cache = client.getMutationCache();
  const observers = new WeakMap<Mutation, Set<unknown>>();
  return cache.subscribe((event) => {
    if (event.type === 'observerAdded' || event.type === 'observerRemoved') {
      const watching = observers.get(event.mutation) ?? new Set();
      if (event.type === 'observerAdded') watching.add(event.observer);
      else watching.delete(event.observer);
      observers.set(event.mutation, watching);
      return;
    }
    if (event.type !== 'updated' || event.action.type !== 'error') return;
    const { mutation } = event;
    if (observers.get(mutation)?.size) return;
    if (!matchMutation({ mutationKey: saveMealKey }, mutation) || isFailedUnwatchedSave(mutation)) return;
    cache.remove(mutation);
    hydrate(
      client,
      { mutations: [{ mutationKey: saveMealKey, state: mutation.state, meta: leftBehindSaveMeta }], queries: [] },
      { defaultOptions: { mutations: { gcTime: Infinity } } },
    );
  });
}

/** postgrest-js reports a request that got no response (offline, DNS, timeout) with an empty code. */
function isNetworkFailure(error: unknown): boolean {
  return !(error as { code?: string } | null)?.code;
}

/**
 * Also the client's mutation defaults for this key (see `lib/queryClient.ts`), so a save
 * persisted while paused offline can still run after the app is closed and opened again.
 */
export const saveMealOptions = mutationOptions({
  mutationKey: saveMealKey,
  mutationFn: async ({ placeId, eatenOn, spinCount, decisionSeconds }: SaveMealInput) => {
    // Without a user token the upsert would go out as anon and fail RLS.
    await requireSession();
    const { error } = await supabase.from('meals').upsert(
      {
        place_id: placeId,
        eaten_on: eatenOn,
        spin_count: spinCount,
        decision_seconds: decisionSeconds,
      },
      { onConflict: 'user_id,eaten_on' },
    );
    if (error) throw error;
  },
  // The upsert is safe to repeat, so a request that got no response is sent again. If the
  // device goes offline in between, the retry waits for the connection instead of failing.
  retry: (failureCount, error) => failureCount < 2 && isNetworkFailure(error),
  retryDelay: (failureCount) => (failureCount + 1) * 1000,
  onSuccess: (_data, input, _result, { client }) => {
    // The day is recorded now, so an earlier failed save for that day no longer needs a notice.
    removeFailedUnwatchedSaves(client, input.eatenOn);
    return client.invalidateQueries({ queryKey: queryKeys.meals });
  },
});

export function useSaveMeal() {
  return useMutation(saveMealOptions);
}

export interface FailedSave {
  input: SaveMealInput;
  message: string;
  /** Sent when the app was opened again, rather than after the home screen was left. */
  restored: boolean;
}

/**
 * Saves that failed with no screen showing them, one per day: a later save for a day replaces an
 * earlier one, so the latest is kept. Each stays until it is retried, superseded or dismissed.
 */
export function useFailedUnwatchedSaves(): FailedSave[] {
  const failures = useMutationState({
    filters: failedUnwatchedSaveFilters,
    select: (mutation) => ({
      input: mutation.state.variables as SaveMealInput,
      // An error restored from storage is a plain object and may have lost its message.
      message: mutation.state.error?.message ?? '',
      restored: mutation.meta?.restored === true,
    }),
  });
  return [...new Map(failures.map((f) => [f.input.eatenOn, f])).values()];
}

/** Drops the failed unwatched saves for a day, leaving that day unrecorded. */
export function useDismissFailedSave() {
  const client = useQueryClient();
  return (eatenOn: string) => removeFailedUnwatchedSaves(client, eatenOn);
}

/** Fields a user can change on their own copy of a place. */
export type PrefPatch = Partial<Pick<PlacePref, 'isFavorite' | 'isHidden' | 'tags'>>;

export function emptyPref(placeId: string): PlacePref {
  return { placeId, isFavorite: false, isHidden: false, tags: [] };
}

export function useSetPref() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ placeId, patch }: { placeId: string; patch: PrefPatch }) => {
      await requireSession();
      const current = client.getQueryData<PlacePref[]>(queryKeys.prefs)?.find((p) => p.placeId === placeId);
      const next = { ...(current ?? emptyPref(placeId)), ...patch };
      const { error } = await supabase.from('user_place_prefs').upsert(
        { place_id: placeId, is_favorite: next.isFavorite, is_hidden: next.isHidden, tags: next.tags },
        { onConflict: 'user_id,place_id' },
      );
      if (error) throw error;
    },
    // Toggles feel instant; the cache is rolled back if the write fails.
    onMutate: async ({ placeId, patch }) => {
      await client.cancelQueries({ queryKey: queryKeys.prefs });
      const previous = client.getQueryData<PlacePref[]>(queryKeys.prefs) ?? [];
      const exists = previous.some((p) => p.placeId === placeId);
      const next = exists
        ? previous.map((p) => (p.placeId === placeId ? { ...p, ...patch } : p))
        : [...previous, { ...emptyPref(placeId), ...patch }];
      client.setQueryData(queryKeys.prefs, next);
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context) client.setQueryData(queryKeys.prefs, context.previous);
    },
    onSettled: () => client.invalidateQueries({ queryKey: queryKeys.prefs }),
  });
}

export interface NewPlaceInput {
  name: string;
  category: string;
  address: string | null;
}

export function useAddPlace() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, category, address }: NewPlaceInput) => {
      // A tap right after the page opened could otherwise go out before sign-in finished, as anon.
      await requireSession();
      const { error } = await supabase.from('places').insert({ source: 'manual', name, category, address });
      if (error) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.places }),
  });
}

/** Updates a manual place the signed-in user added. RLS rejects every other row. */
async function updateOwnPlace(placeId: string, patch: Record<string, unknown>): Promise<void> {
  await requireSession();
  const { data, error } = await supabase.from('places').update(patch).eq('id', placeId).select('id');
  if (error) throw error;
  // RLS skips rows the user may not edit instead of raising, so nothing comes back.
  if (data.length === 0) throw new Error('직접 추가한 사람만 고칠 수 있어요.');
}

export function useUpdatePlace() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ placeId, name, category, address }: NewPlaceInput & { placeId: string }) =>
      updateOwnPlace(placeId, { name, category, address }),
    // History shows place names, so meals are refetched too.
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.places }),
        client.invalidateQueries({ queryKey: queryKeys.meals }),
      ]),
  });
}

/** Deleting deactivates the place, because meals may still reference it (TRD RLS table). */
export function useRemovePlace() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (placeId: string) => updateOwnPlace(placeId, { is_active: false }),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.places }),
  });
}

export function useSetCooldown() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (cooldownDays: number) => {
      const user = await ensureSession();
      const { error } = await supabase
        .from('profiles')
        .upsert({ id: user.id, cooldown_days: cooldownDays }, { onConflict: 'id' });
      if (error) throw error;
    },
    onMutate: (cooldownDays) => client.setQueryData(queryKeys.profile, cooldownDays),
    onSettled: () => client.invalidateQueries({ queryKey: queryKeys.profile }),
  });
}

export function useDeleteMeal() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (mealId: string) => {
      await requireSession();
      const { error } = await supabase.from('meals').delete().eq('id', mealId);
      if (error) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.meals }),
  });
}

export function useChangeMealPlace() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ mealId, placeId }: { mealId: string; placeId: string }) => {
      await requireSession();
      // A corrected meal is no longer the roulette's pick, so it drops out of the
      // decision metrics like a team meal does (PRD success metrics).
      const { data, error } = await supabase
        .from('meals')
        .update({ place_id: placeId, spin_count: null, decision_seconds: null })
        .eq('id', mealId)
        .select('id');
      if (error) throw error;
      if (data.length === 0) throw new Error('기록을 찾지 못했어요.');
    },
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.meals }),
  });
}
