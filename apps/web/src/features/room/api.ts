import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { requireSession, supabase } from '../../lib/supabase.ts';
import { queryKeys } from '../data/queries.ts';

/** Room data is live, so it is fetched fresh and never restored from the persisted cache. */
export const roomKeys = {
  all: ['room'] as const,
  preview: ['room', 'preview'] as const,
  detail: (roomId: string) => ['room', 'detail', roomId] as const,
};

export interface PreviewCandidate {
  placeId: string;
  name: string;
  category: string;
  address: string | null;
  walkMinutes: number | null;
}

interface PreviewRecord {
  place_id: string;
  name: string;
  category: string;
  address: string | null;
  walk_minutes: number | null;
}

export interface RoomCandidate {
  id: string;
  position: number;
  placeId: string;
  name: string;
  category: string;
  lat: number | null;
  lng: number | null;
  address: string | null;
}

export interface RoomMember {
  userId: string;
  nickname: string;
}

export interface Room {
  id: string;
  code: string;
  hostId: string;
  deadlineAt: string;
  status: 'open' | 'closed';
  winnerPlaceId: string | null;
  candidates: RoomCandidate[];
  members: RoomMember[];
  /** voter id → candidate id */
  votes: Map<string, string>;
}

/** Turns a non-2xx reply from create-room into an Error with its message. */
async function invokeCreateRoom<T>(body: Record<string, unknown>): Promise<T> {
  await requireSession();
  const { data, error } = await supabase.functions.invoke<T>('create-room', { body });
  if (error) {
    const context = (error as { context?: Response }).context;
    const reply = context ? ((await context.json().catch(() => null)) as { error?: string } | null) : null;
    throw new Error(reply?.error ?? error.message);
  }
  return data as T;
}

function toPreview(record: PreviewRecord): PreviewCandidate {
  return {
    placeId: record.place_id,
    name: record.name,
    category: record.category,
    address: record.address,
    walkMinutes: record.walk_minutes,
  };
}

export async function fetchPreview(excludePlaceIds: string[] = []): Promise<{ candidates: PreviewCandidate[]; deadlineAt: string }> {
  const data = await invokeCreateRoom<{ candidates: PreviewRecord[]; deadline_at: string }>({
    preview: true,
    exclude_place_ids: excludePlaceIds,
  });
  return { candidates: data.candidates.map(toPreview), deadlineAt: data.deadline_at };
}

export function useRoomPreview() {
  return useQuery({ queryKey: roomKeys.preview, queryFn: () => fetchPreview(), staleTime: Infinity, gcTime: 0, retry: 1 });
}

export interface CreateRoomInput {
  placeIds: string[];
  nickname: string;
  deadlineAt: string;
}

export function useCreateRoom() {
  return useMutation({
    mutationFn: ({ placeIds, nickname, deadlineAt }: CreateRoomInput) =>
      invokeCreateRoom<{ room_id: string; code: string }>({ place_ids: placeIds, nickname, deadline_at: deadlineAt }),
  });
}

/** Joins (or rejoins) a room by its code and returns the room id. */
export function useJoinRoom() {
  return useMutation({
    mutationFn: async ({ code, nickname }: { code: string; nickname: string }) => {
      await requireSession();
      const { data, error } = await supabase.rpc('join_room', { p_code: code, p_nickname: nickname });
      if (error) throw error.code === 'P0002' ? new Error('room not found') : error;
      return data as string;
    },
  });
}

interface CandidateRecord {
  id: string;
  position: number;
  place_id: string;
  places: { name: string; category: string; lat: number | null; lng: number | null; address: string | null } | null;
}

export function useRoom(roomId: string | null) {
  return useQuery({
    queryKey: roomKeys.detail(roomId ?? ''),
    enabled: roomId !== null,
    queryFn: async (): Promise<Room> => {
      const [room, candidates, members, votes] = await Promise.all([
        supabase.from('rooms').select('id, code, host_id, deadline_at, status, winner_place_id').eq('id', roomId!).single(),
        supabase
          .from('room_candidates')
          .select('id, position, place_id, places(name, category, lat, lng, address)')
          .eq('room_id', roomId!)
          .order('position')
          .returns<CandidateRecord[]>(),
        supabase.from('room_members').select('user_id, nickname').eq('room_id', roomId!).order('joined_at'),
        supabase.from('votes').select('voter_id, candidate_id').eq('room_id', roomId!),
      ]);
      for (const result of [room, candidates, members, votes]) if (result.error) throw result.error;
      return {
        id: room.data!.id,
        code: room.data!.code,
        hostId: room.data!.host_id,
        deadlineAt: room.data!.deadline_at,
        status: room.data!.status,
        winnerPlaceId: room.data!.winner_place_id,
        candidates: candidates.data!.map((c) => ({
          id: c.id,
          position: c.position,
          placeId: c.place_id,
          name: c.places?.name ?? '알 수 없는 식당',
          category: c.places?.category ?? '기타',
          lat: c.places?.lat ?? null,
          lng: c.places?.lng ?? null,
          address: c.places?.address ?? null,
        })),
        members: (members.data as { user_id: string; nickname: string }[]).map((m) => ({ userId: m.user_id, nickname: m.nickname })),
        votes: new Map((votes.data as { voter_id: string; candidate_id: string }[]).map((v) => [v.voter_id, v.candidate_id])),
      };
    },
  });
}

export function useVote(roomId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (candidateId: string) => {
      const { error } = await supabase
        .from('votes')
        .upsert({ room_id: roomId, candidate_id: candidateId }, { onConflict: 'room_id,voter_id' });
      if (error) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: roomKeys.detail(roomId) }),
  });
}

/**
 * Refetches the room whenever a vote, a member or the room itself changes, so every member sees
 * the tally and the final result without reloading (PRD F-10).
 */
export function useRoomRealtime(roomId: string | null) {
  const client = useQueryClient();
  useEffect(() => {
    if (!roomId) return;
    const refresh = () => client.invalidateQueries({ queryKey: roomKeys.detail(roomId) });
    const channel = supabase
      .channel(`room:${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'votes', filter: `room_id=eq.${roomId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_members', filter: `room_id=eq.${roomId}` }, refresh)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, () => {
        void refresh();
        // A closed room may have added today's meal.
        void client.invalidateQueries({ queryKey: queryKeys.meals });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [client, roomId]);
}

const NICKNAME_KEY = 'lunch-nickname';

export function readNickname(): string {
  try {
    return localStorage.getItem(NICKNAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function rememberNickname(nickname: string): void {
  try {
    localStorage.setItem(NICKNAME_KEY, nickname);
  } catch {
    // Storage unavailable: the nickname is just asked again next time.
  }
}
