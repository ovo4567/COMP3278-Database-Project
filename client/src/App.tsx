import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { NavBar } from './components/NavBar';
import { FeedPage } from './pages/FeedPage';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { ProfilePage } from './pages/ProfilePage';
import { AdminPage } from './pages/AdminPage';
import { PostPage } from './pages/PostPage';
import { SearchPage } from './pages/SearchPage';
import { CollectionsPage } from './pages/CollectionsPage';
import { PostEditorPage } from './pages/PostEditorPage';
import { authApi } from './lib/api';
import { tokenStorage } from './lib/storage';
import type { User } from './lib/types';
import { NotificationsPage } from './pages/NotificationsPage';
import { notificationsApi } from './lib/api';
import { onNotifyEventBuffered } from './lib/realtime';
import { onUnreadRefreshRequested } from './lib/notificationsSync';

export default function App() {
  const location = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  useEffect(() => {
    const boot = async () => {
      const access = tokenStorage.getAccessToken();
      if (!access) {
        setBooting(false);
        return;
      }

      try {
        const me = await authApi.me();
        setUser(me);
      } catch {
        tokenStorage.clearAll();
        setUser(null);
      } finally {
        setBooting(false);
      }
    };

    void boot();
  }, []);

  useEffect(() => {
    const run = async () => {
      if (!user) {
        setUnreadNotifications(0);
        return;
      }
      try {
        const res = await notificationsApi.unreadCount();
        setUnreadNotifications(res.count);
      } catch {
        // Non-fatal; keep whatever we had.
      }
    };
    void run();
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    const off = onUnreadRefreshRequested(() => {
      void (async () => {
        try {
          const res = await notificationsApi.unreadCount();
          setUnreadNotifications(res.count);
        } catch {
          // Ignore
        }
      })();
    });
    return off;
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    const off = onNotifyEventBuffered((events) => {
      const created = events.filter((ev) => ev.type === 'notification_created').map((ev) => ev.notification);
      if (created.length === 0) return;
      const unreadAdds = created.filter((n) => !n.isRead).length;
      if (unreadAdds) setUnreadNotifications((n) => n + unreadAdds);
    });
    return off;
  }, [user?.id]);

  if (booting) {
    return (
      <div className="min-h-screen px-4 py-10">
        <div className="ui-shell-narrow ui-hero ui-page-enter">
          <div className="ui-kicker">Loading</div>
          <h1 className="ui-h1 mt-3">Warming up your social space</h1>
          <p className="ui-muted mt-2 max-w-lg text-sm">
            Restoring your session, notifications, and latest updates.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="ui-stat">
                <div className="ui-skeleton h-5 w-24" />
                <div className="ui-skeleton mt-3 h-3 w-16" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <NavBar
        user={user}
        unreadNotifications={unreadNotifications}
        onLogout={() => {
          setUser(null);
          setUnreadNotifications(0);
        }}
      />
      <main key={`${location.pathname}${location.search}`} className="ui-page-shell ui-page-enter">
        <Routes location={location}>
          <Route path="/" element={<FeedPage currentUser={user} />} />
          <Route path="/search" element={<SearchPage currentUser={user} />} />
          <Route path="/collections" element={<CollectionsPage currentUser={user} />} />
          <Route path="/compose" element={<PostEditorPage currentUser={user} />} />
          <Route path="/compose/:id" element={<PostEditorPage currentUser={user} />} />
          <Route path="/p/:id" element={<PostPage currentUser={user} />} />
          <Route path="/u/:username" element={<ProfilePage currentUser={user} onUserUpdated={setUser} />} />
          <Route path="/admin" element={<AdminPage currentUser={user} />} />
          <Route path="/notifications" element={<NotificationsPage currentUser={user} onUnreadCountChange={setUnreadNotifications} />} />

          <Route path="/login" element={user ? <Navigate to="/" /> : <LoginPage onLogin={setUser} />} />
          <Route path="/signup" element={user ? <Navigate to="/" /> : <SignupPage onLogin={setUser} />} />

          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  );
}
