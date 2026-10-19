import { m, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { NEAR_WALK_MINUTES } from '../places/vocabulary.ts';
import { cardTop, spotlightBox, type Box } from './placement.ts';

interface TourStep {
  /** `data-tour` value of the element to light up. */
  target: string;
  title: string;
  body: string;
  /** Corner radius of the lit area, matching the target's shape. */
  radius: number;
}

export const TOUR_STEPS: TourStep[] = [
  {
    target: 'filters',
    title: '조건부터 골라도 돼요',
    body: `도보 ${NEAR_WALK_MINUTES}분, 혼밥처럼 켠 조건에 맞는 식당만 룰렛에 올라가요.`,
    radius: 24,
  },
  {
    target: 'spin',
    title: '돌리면 한 곳을 골라 줘요',
    // A no-break space keeps the button name on one line.
    body: "최근에 간 곳은 빼고 골라요. 마음에 들면 '여기 갈래'를 누르세요.",
    radius: 999,
  },
  {
    target: 'room',
    title: '팀이랑 정할 땐 투표로',
    body: '후보 3곳으로 투표 링크를 만들어 팀원에게 보내요.',
    radius: 24,
  },
  {
    target: 'nav',
    title: '식당·기록·설정',
    body: '안 가는 식당은 숨기고, 지난 점심은 기록에서 봐요. 이 안내는 설정에서 다시 볼 수 있어요.',
    radius: 0,
  },
];

const PAD = 8;
const spring = { type: 'spring', stiffness: 380, damping: 36 } as const;

function measure(target: string): Box | null {
  const el = document.querySelector(`[data-tour="${target}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return spotlightBox({ top: r.top, left: r.left, width: r.width, height: r.height }, { width: window.innerWidth, height: window.innerHeight }, PAD);
}

/**
 * First-visit walkthrough: dims the screen, lights up one part at a time and explains it.
 * Clicks on the page are blocked while it is open, so the tour never races the roulette.
 */
export function ProductTour({ onClose }: { onClose: () => void }) {
  const reduceMotion = useReducedMotion() ?? false;
  const titleId = useId();
  const bodyId = useId();
  const [index, setIndex] = useState(0);
  const [spot, setSpot] = useState<Box | null>(null);
  const [cardHeight, setCardHeight] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const step = TOUR_STEPS[index]!;
  const last = index === TOUR_STEPS.length - 1;

  const remeasure = useCallback(() => setSpot(measure(step.target)), [step.target]);

  // Bring the target into view, then light it; follow layout changes (a room card loading in).
  useLayoutEffect(() => {
    document.querySelector(`[data-tour="${step.target}"]`)?.scrollIntoView({ block: 'center' });
    // ResizeObserver reports once right after observe(), which lights the first target.
    const observer = new ResizeObserver(remeasure);
    observer.observe(document.body);
    window.addEventListener('resize', remeasure);
    // The page can still scroll after the jump (the browser finishing it, a viewport change).
    window.addEventListener('scroll', remeasure, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', remeasure);
      window.removeEventListener('scroll', remeasure);
    };
  }, [step.target, remeasure]);

  useLayoutEffect(() => {
    if (cardRef.current) setCardHeight(cardRef.current.offsetHeight);
  }, [index]);

  // The page stays put under the tour, so the lit area keeps matching its target.
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      root.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    nextRef.current?.focus();
  }, [index]);

  function next() {
    if (last) onClose();
    else setIndex(index + 1);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !cardRef.current) return;
    // Keep focus on the card's buttons; the page behind is out of reach while the tour is open.
    const buttons = [...cardRef.current.querySelectorAll<HTMLButtonElement>('button')];
    const first = buttons[0];
    const end = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      end?.focus();
    } else if (!event.shiftKey && document.activeElement === end) {
      event.preventDefault();
      first?.focus();
    }
  }

  const viewportHeight = typeof window === 'undefined' ? 0 : window.innerHeight;
  const top = spot ? cardTop(spot, cardHeight, viewportHeight) : viewportHeight / 2 - cardHeight / 2;
  const transition = reduceMotion ? { duration: 0 } : spring;

  return createPortal(
    // Layer above the sticky nav and the home header; nothing else in the app uses z-index.
    <div className="fixed inset-0 z-50" onKeyDown={onKeyDown}>
      {/* Catches every click, so only the card's buttons work. */}
      <div className="absolute inset-0" aria-hidden="true" />
      {spot ? (
        <m.div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-0 shadow-[0_0_0_9999px_rgb(5_9_7/0.86)] ring-1 ring-ink/30"
          initial={false}
          animate={{ x: spot.left, y: spot.top, width: spot.width, height: spot.height, borderRadius: step.radius }}
          transition={transition}
        />
      ) : (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[rgb(5_9_7/0.86)]" />
      )}
      <m.div
        ref={cardRef}
        key={index}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        // The card follows the light, so the eye lands on the target first.
        transition={{ duration: 0.3, delay: reduceMotion ? 0 : 0.12, ease: [0.32, 0.72, 0, 1] }}
        style={{ top }}
        className="absolute inset-x-4 mx-auto max-w-[24rem] rounded-3xl bg-surface p-5 shadow-[0_24px_60px_-24px_var(--shadow)] ring-1 ring-line"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="pt-1 text-[19px] leading-snug font-extrabold tracking-[-0.02em]">
            {step.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="-mt-2 -mr-2 min-h-11 shrink-0 rounded-full px-3 text-[14px] font-semibold text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            건너뛰기
          </button>
        </div>
        <p id={bodyId} className="mt-1 text-[15px] leading-relaxed break-keep text-ink-muted">
          {step.body}
        </p>
        <div className="mt-4 flex items-center gap-2">
          <p className="flex-1 text-[13px] font-semibold text-ink-muted tabular-nums">
            <span aria-hidden="true">
              {index + 1}/{TOUR_STEPS.length}
            </span>
            <span className="sr-only">
              {TOUR_STEPS.length}단계 중 {index + 1}단계
            </span>
          </p>
          {index > 0 && (
            <button
              type="button"
              onClick={() => setIndex(index - 1)}
              className="min-h-11 rounded-full px-4 text-[15px] font-semibold ring-1 ring-ink/15 transition-transform duration-200 ease-soft active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              이전
            </button>
          )}
          <button
            ref={nextRef}
            type="button"
            onClick={next}
            className="min-h-11 rounded-full bg-accent px-5 text-[15px] font-extrabold text-on-accent transition-transform duration-200 ease-soft active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {last ? '시작하기' : '다음'}
          </button>
        </div>
      </m.div>
    </div>,
    document.body,
  );
}
