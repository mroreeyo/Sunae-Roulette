import type { Candidate } from '@lunch/core';
import { m, useReducedMotion } from 'motion/react';
import { kakaoMapUrl, naverMapUrl } from '../../lib/mapLinks.ts';
import type { PlaceRow } from '../data/queries.ts';

interface ResultCardProps {
  candidate: Candidate & { place: PlaceRow };
  saved: boolean;
  saving: boolean;
  saveError: string | null;
  onAccept: () => void;
  onReroll: () => void;
}

const buttonBase =
  'inline-flex min-h-12 items-center justify-center rounded-full px-5 text-[15px] font-semibold transition-transform duration-200 ease-soft active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

export function ResultCard({ candidate, saved, saving, saveError, onAccept, onReroll }: ResultCardProps) {
  const reduceMotion = useReducedMotion();
  const { place, walkMinutes } = candidate;

  return (
    <m.section
      aria-labelledby="result-name"
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.32, 0.72, 0, 1] }}
      className="rounded-[28px] bg-ink/[0.03] p-1.5 ring-1 ring-line"
    >
      <div className="rounded-[22px] bg-surface p-5 shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]">
        <p className="inline-flex rounded-full bg-accent-soft px-3 py-1 text-[13px] font-semibold text-accent-ink">
          {place.category}
        </p>
        <h2 id="result-name" className="mt-3 text-2xl leading-tight font-bold tracking-tight break-keep">
          {place.name}
        </h2>
        <p className="mt-1.5 text-[15px] text-ink-muted">
          {walkMinutes === null ? '도보 시간 알 수 없음' : `걸어서 약 ${Math.max(1, Math.round(walkMinutes))}분`}
          {place.address ? ` · ${place.address.replace(/^경기도 성남시 분당구 /, '')}` : ''}
        </p>

        {saved ? (
          <div className="mt-5">
            <p className="text-[15px] font-semibold text-accent-ink">오늘 점심으로 기록했어요.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <a className={`${buttonBase} bg-accent text-on-accent`} href={kakaoMapUrl(place)} target="_blank" rel="noreferrer">
                카카오맵 길찾기
              </a>
              <a className={`${buttonBase} bg-surface-2 text-ink`} href={naverMapUrl(place)} target="_blank" rel="noreferrer">
                네이버 지도
              </a>
            </div>
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-[1fr_auto] gap-2">
            <button
              type="button"
              className={`${buttonBase} bg-accent text-on-accent disabled:opacity-60`}
              onClick={onAccept}
              disabled={saving}
            >
              {saving ? '기록하는 중' : '여기 갈래'}
            </button>
            <button type="button" className={`${buttonBase} bg-surface-2 text-ink`} onClick={onReroll} disabled={saving}>
              다시 돌리기
            </button>
          </div>
        )}
        {saveError && (
          <p role="alert" className="mt-3 text-[14px] text-accent-ink">
            기록하지 못했어요. 연결을 확인하고 다시 눌러 주세요. ({saveError})
          </p>
        )}
      </div>
    </m.section>
  );
}
