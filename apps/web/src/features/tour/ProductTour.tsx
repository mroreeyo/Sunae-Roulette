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
    body: `도보 ${NEAR_WALK_MINUTES}분, 혼밥 같은 조건을 켜거나 빼고 싶은 메뉴를 누르면 맞는 식당만 룰렛에 올라가요. 고른 조건은 다음에도 기억해요.`,
    radius: 24,
  },
  {
    target: 'spin',
    title: '돌리면 한 곳을 골라 줘요',
    body: "마음에 들면 '여기 갈래'로 오늘 점심을 기록하고, 아니면 '다시 돌리기'를 누르세요. 최근에 간 곳은 한동안 추천하지 않아요.",
    radius: 999,
  },
  {
    target: 'room',
    title: '팀이랑 정할 땐 투표로',
    body: '후보 3곳으로 투표 링크를 만들어 팀원에게 보내요. 각자 휴대폰에서 고르면 결과가 바로 모여요.',
    radius: 24,
  },
  {
    target: 'nav',
    title: '식당·기록·설정',
    body: '식당 탭에서 안 가는 곳을 숨기고, 기록 탭에서 지난 점심을 봐요. 이 안내는 설정에서 다시 볼 수 있어요.',
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
          className="pointer-events-none absolute top-0 left-0 shadow-[0_0_0_9999px_rgb(5_9_7/0.74)] ring-2 ring-accent"
          initial={false}
          animate={{ x: spot.left, y: spot.top, width: spot.width, height: spot.height, borderRadius: step.radius }}
          transition={transition}
        />
      ) : (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[rgb(5_9_7/0.74)]" />
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
        transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
        style={{ top }}
        className="absolute inset-x-4 mx-auto max-w-[24rem] rounded-3xl bg-surface p-5 shadow-[0_24px_60px_-24px_var(--shadow)] ring-1 ring-line"
      >
        <p className="text-[13px] font-semibold text-ink-muted tabular-nums">
          {index + 1}/{TOUR_STEPS.length}
        </p>
        <h2 id={titleId} className="mt-1 text-[19px] leading-snug font-extrabold tracking-[-0.02em]">
          {step.title}
        </h2>
        <p id={bodyId} className="mt-1.5 text-[15px] leading-relaxed break-keep text-ink-muted">
          {step.body}
        </p>
        <div className="mt-5 flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-full px-3 text-[14px] font-semibold text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            건너뛰기
          </button>
          <span className="flex-1" />
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
