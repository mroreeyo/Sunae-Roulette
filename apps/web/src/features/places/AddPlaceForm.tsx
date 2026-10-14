import { useId, useState, type FormEvent } from 'react';
import { useAddPlace } from '../data/queries.ts';
import { CATEGORIES } from './vocabulary.ts';

const MAX_NAME = 60;

const fieldClass =
  'min-h-12 w-full rounded-2xl bg-bg px-4 text-[16px] text-ink ring-1 ring-line placeholder:text-ink-muted focus:outline-2 focus:outline-accent';

export function AddPlaceForm({ onDone }: { onDone: () => void }) {
  const ids = { name: useId(), category: useId(), address: useId(), error: useId() };
  const addPlace = useAddPlace();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [address, setAddress] = useState('');
  const [touched, setTouched] = useState(false);

  const trimmed = name.trim();
  const nameError = touched && trimmed.length === 0 ? '식당 이름을 입력해 주세요.' : null;

  function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (trimmed.length === 0) return;
    addPlace.mutate(
      { name: trimmed.slice(0, MAX_NAME), category, address: address.trim() || null },
      { onSuccess: onDone },
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4 rounded-3xl bg-surface p-5 ring-1 ring-line">
      <p className="text-[15px] text-ink-muted">추가한 식당은 모든 사용자에게 보여요. 위치는 비워 둬요.</p>

      <div className="flex flex-col gap-2">
        <label htmlFor={ids.name} className="text-[14px] font-semibold">
          식당 이름
        </label>
        <input
          id={ids.name}
          value={name}
          maxLength={MAX_NAME}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setTouched(true)}
          aria-invalid={nameError !== null}
          aria-describedby={nameError ? ids.error : undefined}
          className={fieldClass}
          autoComplete="off"
        />
        {nameError && (
          <p id={ids.error} className="text-[13px] text-accent-ink">
            {nameError}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={ids.category} className="text-[14px] font-semibold">
          카테고리
        </label>
        <select id={ids.category} value={category} onChange={(e) => setCategory(e.target.value)} className={fieldClass}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={ids.address} className="text-[14px] font-semibold">
          주소 <span className="font-normal text-ink-muted">(선택)</span>
        </label>
        <input
          id={ids.address}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className={fieldClass}
          autoComplete="off"
        />
        <p className="text-[13px] text-ink-muted">지도 검색에 쓰여요. 예: 수내동 12-3</p>
      </div>

      {addPlace.isError && (
        <p role="alert" className="text-[14px] text-accent-ink">
          추가하지 못했어요. ({addPlace.error.message})
        </p>
      )}

      <div className="grid grid-cols-[1fr_auto] gap-2">
        <button
          type="submit"
          disabled={addPlace.isPending}
          className="min-h-12 rounded-full bg-accent px-5 text-[15px] font-semibold text-on-accent transition-transform duration-200 ease-soft active:scale-[0.98] disabled:opacity-60"
        >
          {addPlace.isPending ? '추가하는 중' : '추가하기'}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="min-h-12 rounded-full bg-surface-2 px-5 text-[15px] font-semibold text-ink transition-transform duration-200 ease-soft active:scale-[0.98]"
        >
          닫기
        </button>
      </div>
    </form>
  );
}
