import { FunctionsHttpError } from '@supabase/supabase-js';
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

const OFFLINE_MESSAGE = '서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.';
const RETRY_MESSAGE = '잠시 뒤 다시 시도해 주세요.';

/** create-room replies in English for logs; the screens show these instead. */
const CREATE_ROOM_MESSAGES: Record<string, string> = {
  'deadline_at must be within the next 12 hours': '마감 시각은 지금부터 12시간 안으로 골라 주세요.',
  'nickname must be 1 to 20 characters': '닉네임은 1~20자로 입력해 주세요.',
  'place_ids must hold 1 to 3 places': '후보를 1~3곳 골라 주세요.',
  'every place must be an active place': '후보 중에 지금은 없는 식당이 있어요. 후보를 다시 골라 주세요.',
  'too many rooms, try again later': '방을 너무 많이 만들었어요. 10분 뒤에 다시 만들어 주세요.',
  'sign in first': '로그인 정보를 확인하지 못했어요. 새로고침한 뒤 다시 시도해 주세요.',
};

/** postgrest-js reports a request that got no response with an empty code. */
function isNetworkError(error: { code?: string }): boolean {
  return !error.code;
}

/** Calls create-room. A non-2xx reply carries its message; anything else means it was not reached. */
async function invokeCreateRoom<T>(body: Record<string, unknown>): Promise<T> {
  await requireSession();
  const { data, error } = await supabase.functions.invoke<T>('create-room', { body });
  if (error instanceof FunctionsHttpError) {
    const reply = (await (error.context as Response).json().catch(() => null)) as { error?: string } | null;
    throw new Error((reply?.error && CREATE_ROOM_MESSAGES[reply.error]) ?? RETRY_MESSAGE);
  }
  if (error) throw new Error(OFFLINE_MESSAGE);
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

// Room mutations carry a 'room' key so they are never persisted: a paused one restored after a
// restart would have no mutationFn and fail silently (see lib/queryClient.ts).
export function useCreateRoom() {
  return useMutation({
    mutationKey: ['room', 'create'],
    mutationFn: ({ placeIds, nickname, deadlineAt }: CreateRoomInput) =>
      invokeCreateRoom<{ room_id: string; code: string }>({ place_ids: placeIds, nickname, deadline_at: deadlineAt }),
  });
}

export const ROOM_NOT_FOUND = 'room not found';

/** Joins (or rejoins) a room by its code; returns the room id and who joined it. */
export function useJoinRoom() {
  return useMutation({
    mutationKey: ['room', 'join'],
    mutationFn: async ({ code, nickname }: { code: string; nickname: string }) => {
      await requireSession();
      const { data, error } = await supabase.rpc('join_room', { p_code: code, p_nickname: nickname });
      if (error) {
        if (error.code === 'P0002') throw new Error(ROOM_NOT_FOUND);
        if (error.code === '22023') throw new Error('닉네임은 1~20자로 입력해 주세요.');
        throw new Error(isNetworkError(error) ? OFFLINE_MESSAGE : RETRY_MESSAGE);
      }
      const { data: auth } = await supabase.auth.getSession();
      return { roomId: data as string, userId: auth.session?.user.id ?? null };
    },
  });
}

interface CandidateRecord {
  id: string;
  position: number;
  place_id: string;
  places: { name: string; category: string; lat: number | null; lng: number | null; address: string | null } | null;
}

/** How often to look for the result once the deadline has passed (pg_cron closes rooms each minute). */
const WAITING_REFETCH_MS = 5_000;

export function useRoom(roomId: string | null) {
  return useQuery({
    queryKey: roomKeys.detail(roomId ?? ''),
    enabled: roomId !== null,
    // Realtime does not replay events missed while a phone slept, so coming back refetches. An open
    // room is fetched again right after its deadline, then every few seconds until it closes, in
    // case the close event is missed.
    refetchOnWindowFocus: true,
    refetchInterval: (query) => {
      const room = query.state.data;
      if (!room || room.status !== 'open') return false;
      const untilDeadline = new Date(room.deadlineAt).getTime() - Date.now();
      return untilDeadline > 0 ? untilDeadline + 1_000 : WAITING_REFETCH_MS;
    },
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
      for (const result of [room, candidates, members, votes]) {
        if (result.error) {
          throw new Error(isNetworkError(result.error) ? OFFLINE_MESSAGE : '방 정보를 불러오지 못했어요. 링크로 다시 들어와 주세요.');
        }
      }
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
    mutationKey: ['room', 'vote'],
    mutationFn: async (candidateId: string) => {
      const { error } = await supabase
        .from('votes')
        .upsert({ room_id: roomId, candidate_id: candidateId }, { onConflict: 'room_id,voter_id' });
      if (error) {
        if (error.code === '42501') throw new Error('마감 시각이 지나서 투표할 수 없어요.');
        throw new Error(isNetworkError(error) ? OFFLINE_MESSAGE : RETRY_MESSAGE);
      }
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
    // DELETE events skip filters and RLS, and nothing in the app deletes votes or members.
    const channel = supabase
      .channel(`room:${roomId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'votes', filter: `room_id=eq.${roomId}` }, refresh)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'votes', filter: `room_id=eq.${roomId}` }, refresh)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'room_members', filter: `room_id=eq.${roomId}` }, refresh)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'room_members', filter: `room_id=eq.${roomId}` }, refresh)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, () => {
        void refresh();
        // A closed room may have added today's meal.
        void client.invalidateQueries({ queryKey: queryKeys.meals });
      })
      // Changes made before the channel was ready, or while it was reconnecting, are not replayed.
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void refresh();
      });
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
