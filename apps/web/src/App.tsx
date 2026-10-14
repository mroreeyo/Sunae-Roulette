import { NavLink, Route, Routes } from 'react-router';
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
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <main className="flex-1 p-4">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/places" element={<Places />} />
          <Route path="/history" element={<History />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
      <nav className="sticky bottom-0 grid grid-cols-4 border-t bg-white">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end
            className={({ isActive }) =>
              `flex min-h-11 items-center justify-center text-sm ${isActive ? 'font-semibold' : ''}`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
