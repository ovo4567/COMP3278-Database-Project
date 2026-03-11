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
    `ui-motion inline-flex items-center rounded-full px-3 py-2 text-sm font-medium ${
      isActive
        ? 'bg-[rgb(var(--ui-accent-rgb)_/_0.12)] text-[rgb(var(--ui-accent-rgb))] shadow-[0_12px_28px_-22px_rgb(var(--ui-accent-rgb)_/_0.75)]'
        : 'text-gray-700 hover:bg-white/60 dark:text-gray-200 dark:hover:bg-white/5'
    }`;

  return (
    <header className="sticky top-0 z-30 px-3 pt-3 sm:px-4">
      <div className="ui-shell">
        <div className="ui-panel ui-panel-soft flex flex-wrap items-center gap-3 rounded-2xl px-3 py-3 shadow-[0_16px_40px_-28px_rgb(var(--ui-shadow-rgb)_/_0.5)]">
          <Link to="/" className="ui-motion flex min-w-0 items-center gap-3 rounded-2xl px-2 py-1.5 hover:bg-white/30 dark:hover:bg-white/5">
            <span className="ui-avatar h-10 w-10 rounded-2xl text-base">✦</span>
            <div className="min-w-0">
              <div className="ui-title ui-brand text-lg leading-none">Social</div>
              <div className="ui-muted hidden text-xs sm:block">Share updates, friends, and realtime moments</div>
            </div>
          </Link>

          <nav className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
            <NavLink to="/" end className={navItemClass}>
              Feed
            </NavLink>
            <NavLink to="/search" className={navItemClass}>
              Search
            </NavLink>

            {props.user ? (
              <>
                {props.user.role === 'admin' ? (
                  <NavLink to="/admin" className={navItemClass}>
                    Admin
                  </NavLink>
                ) : null}
                <NavLink to="/notifications" className={navItemClass}>
                  <span>Notifications</span>
                  {props.unreadNotifications > 0 ? <span className="ui-badge ml-2">{props.unreadNotifications}</span> : null}
                </NavLink>
                <NavLink
                  to={`/u/${props.user.username}`}
                  className={({ isActive }) =>
                    `ui-motion flex items-center gap-2 rounded-full border px-2 py-1.5 text-sm ${
                      isActive
                        ? 'border-[rgb(var(--ui-accent-rgb)_/_0.42)] bg-[rgb(var(--ui-accent-rgb)_/_0.12)] text-[rgb(var(--ui-accent-rgb))]'
                        : 'border-[rgb(var(--ui-border-rgb)_/_0.6)] bg-white/40 text-gray-700 hover:bg-white/70 dark:bg-white/5 dark:text-gray-100 dark:hover:bg-white/10'
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
                  {theme === 'dark' ? '🌙 Dark' : '☀️ Light'}
                </button>
                <button onClick={logout} className="ui-btn rounded-full px-3 py-2" type="button">
                  Logout
                </button>
              </>
            ) : (
              <>
                <button onClick={toggleTheme} className="ui-btn rounded-full px-3 py-2" type="button" aria-label="Toggle dark mode" title="Toggle dark mode">
                  {theme === 'dark' ? '🌙 Dark' : '☀️ Light'}
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
