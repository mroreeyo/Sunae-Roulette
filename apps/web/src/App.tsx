import { lazy, Suspense } from 'react';
import { NavLink, Route, Routes } from 'react-router';
import { useAuthSync } from './features/account/useAuthSync.ts';
import { RouteErrorBoundary } from './features/ui/RouteErrorBoundary.tsx';
import History from './pages/History.tsx';
import Home from './pages/Home.tsx';
import Places from './pages/Places.tsx';
import Settings from './pages/Settings.tsx';

// Team rooms load on demand so the first screen stays within the bundle budget.
const RoomNew = lazy(() => import('./pages/RoomNew.tsx'));
const RoomVote = lazy(() => import('./pages/RoomVote.tsx'));
// Same placeholder the vote room shows while it loads, so a shared link opens without a blank gap.
const roomFallback = <div className="mt-2 h-[320px] animate-pulse rounded-3xl bg-surface-2" aria-label="불러오는 중" />;

const NAV_ITEMS = [
  { to: '/', label: '룰렛' },
  { to: '/places', label: '식당' },
  { to: '/history', label: '기록' },
  { to: '/settings', label: '설정' },
] as const;

export default function App() {
  useAuthSync();
  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col">
      <main className="flex-1 px-4 pt-4">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/places" element={<Places />} />
          <Route path="/history" element={<History />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/rooms/new" element={<RouteErrorBoundary><Suspense fallback={roomFallback}><RoomNew /></Suspense></RouteErrorBoundary>} />
          <Route path="/r/:code" element={<RouteErrorBoundary><Suspense fallback={roomFallback}><RoomVote /></Suspense></RouteErrorBoundary>} />
        </Routes>
      </main>
      <nav
        aria-label="주요 화면"
        className="sticky bottom-0 grid grid-cols-4 gap-1 border-t border-line bg-bg/90 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-md"
      >
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end
            className={({ isActive }) =>
              `flex min-h-12 items-center justify-center rounded-full text-[15px] transition-colors duration-200 ease-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                isActive ? 'bg-surface-2 font-extrabold text-ink' : 'text-ink-muted'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
