import { Link, NavLink, useNavigate } from 'react-router-dom';
import type { User } from '../lib/types';
import { authApi } from '../lib/api';
import { tokenStorage } from '../lib/storage';
import { useTheme } from '../lib/theme';

export function NavBar(props: { user: User | null; unreadNotifications: number; onLogout: () => void }) {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  const logout = async () => {
    try {
      await authApi.logout();
    } finally {
      tokenStorage.clearAll();
      props.onLogout();
      navigate('/login');
    }
  };

  const initials = props.user?.displayName?.trim()?.charAt(0) ?? props.user?.username.charAt(0) ?? 'S';

  const navItemClass = ({ isActive }: { isActive: boolean }) =>
    `ui-motion inline-flex items-center rounded-full border px-3 py-2 text-sm font-medium backdrop-blur-xl ${
      isActive
        ? 'border-white/40 bg-white/70 text-[rgb(var(--ui-accent-text-rgb))] shadow-[0_18px_36px_-24px_rgb(var(--ui-accent-rgb)_/_0.52)] dark:bg-white/10'
        : 'border-white/20 text-gray-700 hover:bg-white/60 hover:text-gray-900 dark:text-gray-200 dark:hover:bg-white/10'
    }`;

  return (
    <header className="sticky top-0 z-30 px-3 pt-3 sm:px-4">
      <div className="ui-shell">
        <div className="ui-panel ui-panel-soft relative flex flex-wrap items-center gap-3 overflow-hidden rounded-[30px] px-3 py-3 shadow-[0_22px_55px_-30px_rgb(var(--ui-shadow-rgb)_/_0.55)]">
          <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent" />
          <div className="pointer-events-none absolute -right-8 top-1/2 h-24 w-24 -translate-y-1/2 rounded-full bg-[rgb(var(--ui-accent-2-rgb)_/_0.18)] blur-3xl" />
          <div className="pointer-events-none absolute left-10 top-0 h-16 w-16 rounded-full bg-[rgb(var(--ui-accent-rgb)_/_0.16)] blur-2xl" />

          <Link to="/" className="ui-motion flex min-w-0 items-center gap-3 rounded-[24px] px-2 py-1.5 hover:bg-white/30 dark:hover:bg-white/5">
            <span className="ui-avatar h-11 w-11 rounded-[20px] text-base">✦</span>
            <div className="min-w-0">
              <div className="ui-title ui-brand text-lg leading-none">Social Pulse</div>
              <div className="ui-muted hidden text-xs sm:block">Glow, Motion, and Live Energy</div>
            </div>
          </Link>

          <div className="hidden items-center gap-2 rounded-full border border-white/25 bg-white/35 px-3 py-2 text-xs text-gray-700 shadow-[0_14px_30px_-22px_rgb(var(--ui-shadow-rgb)_/_0.45)] backdrop-blur-xl dark:bg-white/10 dark:text-gray-200 lg:inline-flex">
            <span className="h-2 w-2 rounded-full bg-[rgb(var(--ui-accent-2-rgb))] shadow-[0_0_18px_rgb(var(--ui-accent-2-rgb)_/_0.8)]" />
            Live right now
          </div>

          <nav className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
            {props.user ? (
              <div className="flex min-w-0 flex-1 flex-col items-end gap-2">
                <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
                  <NavLink to="/" end className={navItemClass}>
                    Feed
                  </NavLink>
                  <NavLink to="/search" className={navItemClass}>
                    Search
                  </NavLink>
                  <NavLink to="/collections" className={navItemClass}>
                    Collections
                  </NavLink>
                  <NavLink to="/compose" className={navItemClass}>
                    Post studio
                  </NavLink>
                  <NavLink to="/notifications" className={navItemClass}>
                    <span>Notifications</span>
                    {props.unreadNotifications > 0 ? <span className="ui-badge ml-2 bg-white/70 dark:bg-white/15">{props.unreadNotifications}</span> : null}
                  </NavLink>
                  {props.user.role === 'admin' ? (
                    <NavLink to="/admin" className={navItemClass}>
                      Admin
                    </NavLink>
                  ) : null}
                </div>

                <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
                  <NavLink
                    to={`/u/${props.user.username}`}
                    className={({ isActive }) =>
                      `ui-motion flex items-center gap-2 rounded-full border px-2 py-1.5 text-sm backdrop-blur-xl ${
                        isActive
                          ? 'border-white/40 bg-white/70 text-[rgb(var(--ui-accent-text-rgb))] shadow-[0_18px_36px_-24px_rgb(var(--ui-accent-rgb)_/_0.52)] dark:bg-white/10'
                          : 'border-white/20 bg-white/40 text-gray-700 hover:bg-white/70 dark:bg-white/5 dark:text-gray-100 dark:hover:bg-white/10'
                      }`
                    }
                  >
                    {props.user.avatarUrl ? (
                      <img src={props.user.avatarUrl} alt="Your avatar" className="h-8 w-8 rounded-xl border object-cover" loading="lazy" />
                    ) : (
                      <span className="ui-avatar h-8 w-8 rounded-xl text-xs uppercase">{initials}</span>
                    )}
                    <span className="hidden max-w-32 truncate sm:block">@{props.user.username}</span>
                  </NavLink>
                  <button onClick={toggleTheme} className="ui-btn rounded-full px-3 py-2" type="button" aria-label="Toggle dark mode" title="Toggle dark mode">
                    {theme === 'dark' ? 'Moon mode' : 'Sun mode'}
                  </button>
                  <button onClick={logout} className="ui-btn rounded-full px-3 py-2" type="button">
                    Logout
                  </button>
                </div>
              </div>
            ) : (
              <>
                <NavLink to="/" end className={navItemClass}>
                  Feed
                </NavLink>
                <NavLink to="/search" className={navItemClass}>
                  Search
                </NavLink>
                <button onClick={toggleTheme} className="ui-btn rounded-full px-3 py-2" type="button" aria-label="Toggle dark mode" title="Toggle dark mode">
                  {theme === 'dark' ? 'Moon mode' : 'Sun mode'}
                </button>
                <NavLink to="/login" className={navItemClass}>
                  Login
                </NavLink>
                <NavLink to="/signup" className={({ isActive }) => `${isActive ? 'ui-btn ui-btn-primary' : 'ui-btn ui-btn-primary'} rounded-full px-4 py-2`}>
                  Join now
                </NavLink>
              </>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}
