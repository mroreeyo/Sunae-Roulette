import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface TourState {
  /** The first-visit tour was finished or skipped in this browser. */
  done: boolean;
  finish: () => void;
  /** Shows the tour again on the next home screen ("사용법 다시 보기" in settings). */
  replay: () => void;
}

/** Remembered per browser, like the filters; a new device shows the tour once. */
export const useTour = create<TourState>()(
  persist(
    (set) => ({
      done: false,
      finish: () => set({ done: true }),
      replay: () => set({ done: false }),
    }),
    { name: 'lunch-tour', storage: createJSONStorage(() => localStorage) },
  ),
);
