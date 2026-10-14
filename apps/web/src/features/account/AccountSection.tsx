import { useMutation } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase.ts';
import { useSession } from '../data/queries.ts';

type Mode = 'link' | 'login';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const fieldClass =
  'min-h-12 w-full rounded-2xl bg-bg px-4 text-[16px] text-ink ring-1 ring-line focus:outline-2 focus:outline-accent';
const primary =
  'min-h-12 rounded-full bg-accent px-5 text-[15px] font-semibold text-on-accent transition-transform duration-200 ease-soft active:scale-[0.98] disabled:opacity-60';

function redirectUrl(): string {
  return `${window.location.origin}/settings`;
}

export function AccountSection() {
  const ids = { email: useId(), error: useId() };
  const session = useSession();
  const user = session.data;
  const [mode, setMode] = useState<Mode>('link');
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);

  const send = useMutation({
    mutationFn: async ({ mode, email }: { mode: Mode; email: string }) => {
      const { error } =
        mode === 'link'
          ? // Attaches the email to this anonymous user, so the same user id keeps its history.
            await supabase.auth.updateUser({ email }, { emailRedirectTo: redirectUrl() })
          : await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: redirectUrl() } });
      if (error) throw error;
    },
  });

  if (!user) return null;

  if (!user.is_anonymous) {
    return (
      <section aria-labelledby="account-title" className="rounded-3xl bg-surface p-5 ring-1 ring-line">
        <h2 id="account-title" className="text-[17px] font-bold">
          계정
        </h2>
        <p className="mt-1 text-[15px]">{user.email}에 연결되어 있어요.</p>
        <p className="mt-1 text-[14px] text-ink-muted">
          다른 기기에서는 설정의 “이메일로 로그인”을 눌러 같은 이메일을 입력하면 돼요.
        </p>
      </section>
    );
  }

  const trimmed = email.trim();
  const emailError = touched && !EMAIL.test(trimmed) ? '이메일 주소를 확인해 주세요.' : null;

  function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!EMAIL.test(trimmed)) return;
    send.mutate({ mode, email: trimmed });
  }

  function switchMode(next: Mode) {
    setMode(next);
    send.reset();
  }

  return (
    <section aria-labelledby="account-title" className="rounded-3xl bg-surface p-5 ring-1 ring-line">
      <h2 id="account-title" className="text-[17px] font-bold">
        {mode === 'link' ? '다른 기기에서도 쓰기' : '이메일로 로그인'}
      </h2>
      <p className="mt-1 text-[14px] text-ink-muted">
        {mode === 'link'
          ? '이메일을 연결하면 다른 휴대폰이나 PC에서도 지금 기록을 그대로 볼 수 있어요.'
          : '다른 기기에서 연결한 이메일로 로그인해요. 이 기기에 쌓인 기록은 옮겨지지 않아요.'}
      </p>
      {user.new_email && mode === 'link' && (
        <p className="mt-2 text-[14px] font-medium text-accent-ink">{user.new_email} 확인을 기다리고 있어요.</p>
      )}

      {send.isSuccess ? (
        <p role="status" className="mt-4 text-[15px] font-semibold text-accent-ink">
          {trimmed}로 링크를 보냈어요. 메일의 링크를 눌러 주세요.
        </p>
      ) : (
        <form onSubmit={submit} noValidate className="mt-4 flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <label htmlFor={ids.email} className="text-[14px] font-semibold">
              이메일
            </label>
            <input
              id={ids.email}
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setTouched(true)}
              aria-invalid={emailError !== null}
              aria-describedby={emailError ? ids.error : undefined}
              className={fieldClass}
            />
            {emailError && (
              <p id={ids.error} className="text-[13px] text-accent-ink">
                {emailError}
              </p>
            )}
          </div>
          {send.isError && (
            <p role="alert" className="text-[14px] text-accent-ink">
              링크를 보내지 못했어요. ({send.error.message})
            </p>
          )}
          <button type="submit" className={primary} disabled={send.isPending}>
            {send.isPending ? '보내는 중' : mode === 'link' ? '연결 링크 보내기' : '로그인 링크 보내기'}
          </button>
        </form>
      )}

      <button
        type="button"
        onClick={() => switchMode(mode === 'link' ? 'login' : 'link')}
        className="mt-3 min-h-11 text-[14px] font-semibold text-ink-muted underline"
      >
        {mode === 'link' ? '이미 이메일을 연결했나요? 이메일로 로그인' : '이 기기의 기록에 이메일 연결하기'}
      </button>
    </section>
  );
}
