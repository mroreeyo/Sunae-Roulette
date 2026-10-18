import { Component, type ReactNode } from 'react';

interface State {
  failed: boolean;
}

/**
 * Catches a screen that fails to render, typically a lazily loaded chunk that a new deployment
 * replaced while this tab was open, and offers a reload instead of a blank app.
 */
export class RouteErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="mt-2 rounded-3xl bg-surface p-5 ring-1 ring-line">
        <p className="font-semibold">화면을 불러오지 못했어요.</p>
        <p className="mt-1 text-[14px] text-ink-muted">새 버전이 나왔을 수 있어요. 새로고침하면 다시 열려요.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 min-h-11 rounded-full bg-accent px-5 text-[15px] font-semibold text-on-accent transition-transform duration-200 ease-soft active:scale-[0.98]"
        >
          새로고침
        </button>
      </div>
    );
  }
}
