import { addDays, toSeoulDate, type LatLng, type Meal, type Place, type PlacePref } from '@lunch/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ensureSession, supabase } from '../../lib/supabase.ts';

/** Cooldown used until the user changes it in settings (PRD default). */
export const DEFAULT_COOLDOWN_DAYS = 5;
/** Enough history for the 10-business-day fresh bonus and the 30-day stats. */
const HISTORY_CALENDAR_DAYS = 45;

export interface PlaceRow extends Place {
  address: string | null;
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
        .select('id, name, category, lat, lng, address, is_active')
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
  spinCount: number;
  decisionSeconds: number;
}

export function useSaveMeal() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ placeId, spinCount, decisionSeconds }: SaveMealInput) => {
      const { error } = await supabase.from('meals').upsert(
        {
          place_id: placeId,
          eaten_on: toSeoulDate(new Date()),
          spin_count: spinCount,
          decision_seconds: decisionSeconds,
        },
        { onConflict: 'user_id,eaten_on' },
      );
      if (error) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.meals }),
  });
}

export function useDeleteMeal() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (mealId: string) => {
      const { error } = await supabase.from('meals').delete().eq('id', mealId);
      if (error) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.meals }),
  });
}
