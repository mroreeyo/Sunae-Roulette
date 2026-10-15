import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { useAddPlace, useRemovePlace, useUpdatePlace, type NewPlaceInput, type PlaceRow } from '../data/queries.ts';
import { fieldClass } from '../ui/field.ts';
import { CATEGORIES } from './vocabulary.ts';

const MAX_NAME = 60;

interface PlaceFieldsProps {
  initial?: NewPlaceInput;
  className: string;
  intro: string;
  submitLabel: string;
  pendingLabel: string;
  /** Disables the buttons while any change is being sent. */
  busy: boolean;
  /** Shows the pending label on the submit button. */
  submitting: boolean;
  /** Full message shown under the fields, or null. */
  errorText: string | null;
  onSubmit: (values: NewPlaceInput) => void;
  onClose: () => void;
  /** Extra actions under the main buttons. */
  children?: ReactNode;
}

function PlaceFields({
  initial,
  className,
  intro,
  submitLabel,
  pendingLabel,
  busy,
  submitting,
  errorText,
  onSubmit,
  onClose,
  children,
}: PlaceFieldsProps) {
  const ids = { name: useId(), category: useId(), address: useId(), error: useId() };
  const [name, setName] = useState(initial?.name ?? '');
  const [category, setCategory] = useState<string>(initial?.category ?? CATEGORIES[0]);
  const [address, setAddress] = useState(initial?.address ?? '');
  const [touched, setTouched] = useState(false);

  const trimmed = name.trim();
  const nameError = touched && trimmed.length === 0 ? '식당 이름을 입력해 주세요.' : null;

  function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (trimmed.length === 0) return;
    onSubmit({ name: trimmed.slice(0, MAX_NAME), category, address: address.trim() || null });
  }

  return (
    <form onSubmit={submit} noValidate className={`flex flex-col gap-4 ${className}`}>
      <p className="text-[15px] text-ink-muted">{intro}</p>

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

      {errorText && (
        <p role="alert" className="text-[14px] text-accent-ink">
          {errorText}
        </p>
      )}

      <div className="grid grid-cols-[1fr_auto] gap-2">
        <button
          type="submit"
          disabled={busy}
          className="min-h-12 rounded-full bg-accent px-5 text-[15px] font-semibold text-on-accent transition-transform duration-200 ease-soft active:scale-[0.98] disabled:opacity-60"
        >
          {submitting ? pendingLabel : submitLabel}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="min-h-12 rounded-full bg-surface-2 px-5 text-[15px] font-semibold text-ink transition-transform duration-200 ease-soft active:scale-[0.98]"
        >
          닫기
        </button>
      </div>

      {children}
    </form>
  );
}

export function AddPlaceForm({ onDone }: { onDone: () => void }) {
  const addPlace = useAddPlace();
  return (
    <PlaceFields
      className="rounded-3xl bg-surface p-5 ring-1 ring-line"
      intro="추가한 식당은 모든 사용자에게 보여요. 위치는 비워 둬요."
      submitLabel="추가하기"
      pendingLabel="추가하는 중"
      busy={addPlace.isPending}
      submitting={addPlace.isPending}
      errorText={addPlace.isError ? `추가하지 못했어요. (${addPlace.error.message})` : null}
      onSubmit={(values) => addPlace.mutate(values, { onSuccess: onDone })}
      onClose={onDone}
    />
  );
}

/**
 * Edits or deletes a manual place, shown only to the user who added it (PRD risk table).
 * `onDone` receives a notice to announce, or null when the form was just closed.
 */
export function EditPlaceForm({ place, onDone }: { place: PlaceRow; onDone: (notice: string | null) => void }) {
  const updatePlace = useUpdatePlace();
  const removePlace = useRemovePlace();
  const busy = updatePlace.isPending || removePlace.isPending;

  let errorText: string | null = null;
  if (updatePlace.isError) errorText = `저장하지 못했어요. (${updatePlace.error.message})`;
  else if (removePlace.isError) errorText = `지우지 못했어요. (${removePlace.error.message})`;
  else if (updatePlace.isPaused || removePlace.isPaused) errorText = '지금은 오프라인이에요. 연결되면 바로 반영할게요.';

  function save(values: NewPlaceInput) {
    const unchanged =
      values.name === place.name && values.category === place.category && values.address === place.address;
    if (unchanged) {
      onDone(null);
      return;
    }
    updatePlace.mutate({ placeId: place.id, ...values }, { onSuccess: () => onDone(`“${values.name}” 정보를 고쳤어요.`) });
  }

  function remove() {
    const message = `“${place.name}” 식당을 지울까요? 모든 사용자의 목록과 룰렛에서 빠지고, 지난 식사 기록은 그대로 남아요.`;
    if (!window.confirm(message)) return;
    removePlace.mutate(place.id, { onSuccess: () => onDone(`“${place.name}” 식당을 지웠어요.`) });
  }

  return (
    <PlaceFields
      initial={{ name: place.name, category: place.category, address: place.address }}
      className="mt-3 border-t border-line pt-4"
      intro="고친 내용은 모든 사용자에게 보여요."
      submitLabel="저장하기"
      pendingLabel="저장하는 중"
      busy={busy}
      submitting={updatePlace.isPending}
      errorText={errorText}
      onSubmit={save}
      onClose={() => onDone(null)}
    >
      <button
        type="button"
        disabled={busy}
        onClick={remove}
        className="min-h-11 self-start rounded-full px-1 text-[14px] font-semibold text-accent-ink underline underline-offset-4 transition-transform duration-200 ease-soft active:scale-[0.98] disabled:opacity-60"
      >
        {removePlace.isPending ? '지우는 중' : '이 식당 지우기'}
      </button>
    </PlaceFields>
  );
}
