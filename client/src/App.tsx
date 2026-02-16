import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { NavBar } from './components/NavBar';
import { FeedPage } from './pages/FeedPage';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { ProfilePage } from './pages/ProfilePage';
import { ChatPage } from './pages/ChatPage';
import { AdminPage } from './pages/AdminPage';
import { PostPage } from './pages/PostPage';
import { SearchPage } from './pages/SearchPage';
import { authApi } from './lib/api';
import { tokenStorage } from './lib/storage';
import type { User } from './lib/types';
import { NotificationsPage } from './pages/NotificationsPage';
import { notificationsApi } from './lib/api';
import { onNotifyEventBuffered } from './lib/realtime';
import { onUnreadRefreshRequested } from './lib/notificationsSync';

export default function App() {
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
    return <div className="p-6 text-sm text-gray-700">Loading…</div>;
  }

  return (
    <div className="min-h-screen">
      <NavBar user={user} unreadNotifications={unreadNotifications} onLogout={() => {
        setUser(null);
        setUnreadNotifications(0);
      }} />
      <Routes>
        <Route path="/" element={<FeedPage currentUser={user} />} />
        <Route path="/search" element={<SearchPage currentUser={user} />} />
        <Route path="/p/:id" element={<PostPage currentUser={user} />} />
        <Route path="/u/:username" element={<ProfilePage currentUser={user} onUserUpdated={setUser} />} />
        <Route path="/admin" element={<AdminPage currentUser={user} />} />
        <Route path="/chat" element={<ChatPage currentUser={user} />} />
        <Route path="/notifications" element={<NotificationsPage currentUser={user} onUnreadCountChange={setUnreadNotifications} />} />

        <Route path="/login" element={user ? <Navigate to="/" /> : <LoginPage onLogin={setUser} />} />
        <Route path="/signup" element={user ? <Navigate to="/" /> : <SignupPage onLogin={setUser} />} />

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </div>
  );
}
