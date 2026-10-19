import type { Candidate, LatLng } from '@lunch/core';
import { m, useReducedMotion } from 'motion/react';
import { kakaoMapUrl, naverMapUrl } from '../../lib/mapLinks.ts';
import type { PlaceRow } from '../data/queries.ts';
import { CategoryBadge } from '../ui/CategoryBadge.tsx';
import { bearingText, RadiusRing } from '../ui/RadiusRing.tsx';
import { WalkTime } from '../ui/WalkTime.tsx';

interface ResultCardProps {
  candidate: Candidate & { place: PlaceRow };
  /** Where distances are measured from (app_config). */
  origin: { base: LatLng; baseName: string; radiusM: number };
  saved: boolean;
  saving: boolean;
  /** The save is queued until the device is back online. */
  waitingForNetwork: boolean;
  saveError: string | null;
  onAccept: () => void;
  onReroll: () => void;
}

const buttonBase =
  'inline-flex items-center justify-center rounded-full px-5 font-semibold transition-transform duration-200 ease-soft active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

export function ResultCard({ candidate, origin, saved, saving, waitingForNetwork, saveError, onAccept, onReroll }: ResultCardProps) {
  const reduceMotion = useReducedMotion();
  const { place, walkMinutes } = candidate;
  const point = place.lat !== null && place.lng !== null ? { lat: place.lat, lng: place.lng } : null;

  return (
    <m.section
      aria-labelledby="result-name"
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.32, 0.72, 0, 1] }}
      className="overflow-hidden rounded-3xl bg-surface ring-1 ring-line"
    >
      <div className={`bg-panel px-5 pt-5 text-on-panel ${point ? 'pb-12' : 'pb-5'}`}>
        <p className="text-[13px] font-bold text-on-panel-muted">오늘의 추천</p>
        <h2 id="result-name" className="mt-1 text-[32px] leading-[1.12] font-extrabold tracking-[-0.035em] break-keep">
          {place.name}
        </h2>
        {/* One line for the address, so a long one never pushes the buttons off the first screen. */}
        <p className="mt-2 flex items-center gap-2 text-[14px] font-semibold text-on-panel-muted">
          <CategoryBadge category={place.category} onPanel />
          {place.address && <span className="min-w-0 truncate">{place.address.replace(/^경기도 성남시 분당구 /, '')}</span>}
        </p>
      </div>

      <div className="flex flex-col gap-4 px-5 pb-5">
        <div className="flex items-start justify-between gap-3">
          <WalkTime minutes={walkMinutes} detail={point ? bearingText(origin.baseName, origin.base, point) : null} />
          {point && (
            <div className="-mt-10 shrink-0 rounded-full bg-surface p-1.5">
              <RadiusRing base={origin.base} baseName={origin.baseName} point={point} radiusM={origin.radiusM} size={116} />
            </div>
          )}
        </div>

        {saved ? (
          <div className="flex flex-col gap-3">
            <p className="text-[15px] font-semibold">오늘 점심으로 기록했어요.</p>
            <div className="grid grid-cols-2 gap-2">
              <a className={`${buttonBase} min-h-12 bg-kakao text-[15px] text-on-brand`} href={kakaoMapUrl(place)} target="_blank" rel="noreferrer">
                카카오맵
              </a>
              <a className={`${buttonBase} min-h-12 bg-naver text-[15px] text-on-brand`} href={naverMapUrl(place)} target="_blank" rel="noreferrer">
                네이버 지도
              </a>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={`${buttonBase} min-h-[54px] bg-accent text-[17px] font-extrabold text-on-accent disabled:opacity-60`}
              onClick={onAccept}
              disabled={saving}
            >
              {waitingForNetwork ? '연결 기다리는 중' : saving ? '기록하는 중' : '여기 갈래'}
            </button>
            <button type="button" className={`${buttonBase} min-h-[54px] bg-surface-2 text-[16px] text-ink`} onClick={onReroll} disabled={saving}>
              다시 돌리기
            </button>
          </div>
        )}
        {waitingForNetwork && (
          <p role="status" className="text-[14px] text-ink-muted">
            지금은 오프라인이에요. 연결되면 바로 기록할게요.
          </p>
        )}
        {saveError && (
          <p role="alert" className="text-[14px] text-accent-ink">
            기록하지 못했어요. 연결을 확인하고 다시 눌러 주세요. ({saveError})
          </p>
        )}
      </div>
    </m.section>
  );
}
