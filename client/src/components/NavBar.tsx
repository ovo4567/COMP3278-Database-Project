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

  const navItemClass = ({ isActive }: { isActive: boolean }) =>
    `ui-motion text-sm ${isActive ? 'font-medium' : ''}`;

  const navItemStyle = ({ isActive }: { isActive: boolean }) =>
    isActive
      ? {
          color: 'rgb(var(--ui-accent-rgb))',
          textDecoration: 'underline',
          textDecorationThickness: '2px',
          textUnderlineOffset: '6px',
        }
      : { color: 'inherit' };

  return (
    <header
      className="sticky top-0 z-20 border-b backdrop-blur"
      style={{ borderColor: 'rgb(var(--ui-border-rgb) / 0.6)', backgroundColor: 'rgb(var(--ui-surface-rgb) / 0.78)' }}
    >
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <Link to="/" className="ui-title text-lg" style={{ color: 'rgb(var(--ui-accent-rgb))', letterSpacing: '-0.01em' }}>
          Social
        </Link>

        <div className="flex items-center gap-3">
          <NavLink to="/search" className={navItemClass} style={navItemStyle}>
            Search
          </NavLink>

          <button
            onClick={toggleTheme}
            className="ui-btn"
            type="button"
            aria-label="Toggle dark mode"
            title="Toggle dark mode"
          >
            {theme === 'dark' ? 'Dark' : 'Light'}
          </button>

          {props.user ? (
            <>
              {props.user.role === 'admin' ? (
                <NavLink to="/admin" className={navItemClass} style={navItemStyle}>
                  Admin
                </NavLink>
              ) : null}
              <NavLink to="/notifications" className={navItemClass} style={navItemStyle}>
                Notifications
                {props.unreadNotifications > 0 ? (
                  <span className="ui-badge ml-1">
                    {props.unreadNotifications}
                  </span>
                ) : null}
              </NavLink>
              <NavLink to="/chat" className={navItemClass} style={navItemStyle}>
                Chat
              </NavLink>
              <NavLink to={`/u/${props.user.username}`} className={navItemClass} style={navItemStyle}>
                @{props.user.username}
              </NavLink>
              <button
                onClick={logout}
                className="ui-btn"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <NavLink to="/login" className={navItemClass} style={navItemStyle}>
                Login
              </NavLink>
              <NavLink to="/signup" className={navItemClass} style={navItemStyle}>
                Sign up
              </NavLink>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
