import { create } from 'zustand';

interface RouletteSessionState {
  /** Places passed over with "다시 돌리기" in this session. */
  skippedIds: string[];
  spinCount: number;
  firstSpinAt: number | null;
  recordSpin: () => void;
  skip: (placeId: string) => void;
  clearSkipped: () => void;
  reset: () => void;
}

export const useRouletteSession = create<RouletteSessionState>()((set) => ({
  skippedIds: [],
  spinCount: 0,
  firstSpinAt: null,
  recordSpin: () =>
    set((s) => ({ spinCount: s.spinCount + 1, firstSpinAt: s.firstSpinAt ?? Date.now() })),
  skip: (placeId) => set((s) => ({ skippedIds: [...s.skippedIds, placeId] })),
  clearSkipped: () => set({ skippedIds: [] }),
  reset: () => set({ skippedIds: [], spinCount: 0, firstSpinAt: null }),
}));
