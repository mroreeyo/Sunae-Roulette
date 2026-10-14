import { DEFAULT_COOLDOWN_DAYS, useAppConfig, useCooldownDays, useSetCooldown } from '../features/data/queries.ts';

const MIN_COOLDOWN = 3;
const MAX_COOLDOWN = 10;

const stepButton =
  'inline-flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-[22px] font-semibold text-ink transition-transform duration-200 ease-soft active:scale-[0.95] disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

export default function Settings() {
  const config = useAppConfig();
  const cooldown = useCooldownDays();
  const setCooldown = useSetCooldown();
  const days = cooldown.data ?? DEFAULT_COOLDOWN_DAYS;

  return (
    <div className="flex flex-col gap-5 pb-4">
      <header className="pt-2">
        <h1 className="text-[26px] leading-tight font-bold tracking-tight">설정</h1>
      </header>

      <section aria-labelledby="cooldown-title" className="rounded-3xl bg-surface p-5 ring-1 ring-line">
        <h2 id="cooldown-title" className="text-[17px] font-bold">
          다시 추천하지 않는 기간
        </h2>
        <p className="mt-1 text-[14px] text-ink-muted">
          최근 이 기간 안에 간 식당은 룰렛에 나오지 않아요. 주말은 세지 않아요.
        </p>
        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            className={stepButton}
            aria-label="하루 줄이기"
            disabled={days <= MIN_COOLDOWN || cooldown.isPending}
            onClick={() => setCooldown.mutate(days - 1)}
          >
            -
          </button>
          <p className="text-[28px] font-bold tabular-nums" aria-live="polite">
            {days}
            <span className="ml-1 text-[16px] font-semibold text-ink-muted">영업일</span>
          </p>
          <button
            type="button"
            className={stepButton}
            aria-label="하루 늘리기"
            disabled={days >= MAX_COOLDOWN || cooldown.isPending}
            onClick={() => setCooldown.mutate(days + 1)}
          >
            +
          </button>
        </div>
        {setCooldown.isError && (
          <p role="alert" className="mt-3 text-[14px] text-accent-ink">
            저장하지 못했어요. ({setCooldown.error.message})
          </p>
        )}
      </section>

      <section aria-labelledby="base-title" className="rounded-3xl bg-surface p-5 ring-1 ring-line">
        <h2 id="base-title" className="text-[17px] font-bold">
          기준 위치
        </h2>
        <p className="mt-1 text-[15px]">
          {config.data ? `${config.data.baseName}, 반경 ${config.data.radiusM}m` : '불러오는 중'}
        </p>
        <p className="mt-1 text-[14px] text-ink-muted">모든 사용자가 같은 기준 위치를 써요.</p>
      </section>

      <section aria-labelledby="source-title" className="rounded-3xl bg-surface p-5 ring-1 ring-line">
        <h2 id="source-title" className="text-[17px] font-bold">
          데이터 출처
        </h2>
        <ul className="mt-2 flex flex-col gap-1.5 text-[14px] text-ink-muted">
          <li>식당 정보: 행정안전부 공공데이터(일반음식점·휴게음식점 인허가 정보)</li>
          <li>
            배경 사진:{' '}
            <a className="underline" href="https://commons.wikimedia.org/wiki/File:View_from_Sunae_Overpass.jpg" target="_blank" rel="noreferrer">
              View from Sunae Overpass
            </a>
            , Semtall, CC BY-SA 4.0
          </li>
          <li>지도: 카카오맵, 네이버 지도로 연결만 해요. 지도 정보는 저장하지 않아요.</li>
        </ul>
      </section>
    </div>
  );
}
