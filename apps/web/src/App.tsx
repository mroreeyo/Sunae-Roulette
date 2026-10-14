import { NavLink, Route, Routes } from 'react-router';
import { useAuthSync } from './features/account/useAuthSync.ts';
import History from './pages/History.tsx';
import Home from './pages/Home.tsx';
import Places from './pages/Places.tsx';
import Settings from './pages/Settings.tsx';

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
        </Routes>
      </main>
      <nav
        aria-label="주요 화면"
        className="sticky bottom-0 grid grid-cols-4 border-t border-line bg-bg/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
      >
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end
            className={({ isActive }) =>
              `flex min-h-14 items-center justify-center text-[15px] transition-colors duration-200 ease-soft ${
                isActive ? 'font-bold text-accent-ink' : 'text-ink-muted'
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
