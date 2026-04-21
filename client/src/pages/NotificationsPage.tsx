import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { friendsApi, notificationsApi } from '../lib/api';
import type { NotificationItem, User } from '../lib/types';
import { onNotifyEventBuffered } from '../lib/realtime';
import { onUnreadRefreshRequested } from '../lib/notificationsSync';
import { Timestamp } from '../components/Timestamp';

export function NotificationsPage(props: {
  currentUser: User | null;
  onUnreadCountChange: Dispatch<SetStateAction<number>>;
}) {
  const navigate = useNavigate();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [handledFriendRequests, setHandledFriendRequests] = useState<Record<number, 'accepted' | 'rejected'>>({});

  const unreadCount = useMemo(() => items.filter((n) => !n.isRead).length, [items]);

  const load = async (reset: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const res = await notificationsApi.list({ limit: 30, cursor: reset ? null : nextCursor });
      setItems((prev) => (reset ? res.items : [...prev, ...res.items]));
      setNextCursor(res.nextCursor);
      if (reset) {
        try {
          const c = await notificationsApi.unreadCount();
          props.onUnreadCountChange(c.count);
        } catch {
          props.onUnreadCountChange(res.items.filter((n) => !n.isRead).length);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!props.currentUser) return;
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.currentUser?.id]);

  useEffect(() => {
    if (!props.currentUser) return;
    const off = onUnreadRefreshRequested(() => {
      void load(true);
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.currentUser?.id]);

  useEffect(() => {
    if (!props.currentUser) return;
    const off = onNotifyEventBuffered((events) => {
      const created = events.filter((ev) => ev.type === 'notification_created').map((ev) => ev.notification);
      if (created.length === 0) return;
      setItems((prev) => [...created, ...prev]);
      const unreadAdds = created.filter((n) => !n.isRead).length;
      if (unreadAdds) props.onUnreadCountChange((n) => n + unreadAdds);
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.currentUser?.id]);

  const markRead = async (id: number) => {
    setError(null);
    try {
      await notificationsApi.markRead([id]);
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
      props.onUnreadCountChange((n) => Math.max(0, n - 1));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark read');
    }
  };

  const markReadIfNeeded = async (n: NotificationItem) => {
    if (n.isRead) return;
    await markRead(n.id);
  };

  const userIdForFriendRequest = (n: NotificationItem): string | null => {
    if (n.actorUser && typeof n.actorUser.id === 'string') return n.actorUser.id;
    return null;
  };

  const markAllRead = async () => {
    setError(null);
    try {
      await notificationsApi.markReadAll();
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
      props.onUnreadCountChange(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark all read');
    }
  };

  const renderText = (n: NotificationItem) => {
    const actor = n.actorUser?.username ? `@${n.actorUser.username}` : 'Someone';
    if (n.type === 'friend_request_received') return `Friend request from ${actor}`;
    if (n.type === 'friend_request_accepted') return `${actor} accepted your friend request`;
    if (n.type === 'post_liked') return `${actor} liked your post`;
    if (n.type === 'post_commented') return `${actor} commented on your post`;
    if (n.type === 'message_received') return `New message`;
    if (n.type === 'comment_mention') return `${actor} mentioned you in a comment`;
    return n.type;
  };

  const renderLink = (n: NotificationItem) => {
    if ((n.type === 'friend_request_received' || n.type === 'friend_request_accepted') && n.actorUser?.username) {
      return `/u/${encodeURIComponent(n.actorUser.username)}`;
    }
    return null;
  };

  const openNotification = async (n: NotificationItem) => {
    const href = renderLink(n);
    if (!href) return;
    setBusyId(n.id);
    setError(null);
    try {
      await markReadIfNeeded(n);
      navigate(href);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open');
    } finally {
      setBusyId(null);
    }
  };

  if (!props.currentUser) return <Navigate to="/login" />;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="ui-h1">Notifications</h1>
          <div className="ui-muted mt-1 text-xs">Unread and friend requests.</div>
        </div>
        <Link to="/" className="ui-link text-sm">
          Back to feed
        </Link>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="text-sm text-gray-700 dark:text-gray-300">Unread: {unreadCount}</div>
        <button
          onClick={() => void markAllRead()}
          className="ui-btn"
          type="button"
        >
          Mark all read
        </button>
      </div>

      {error ? <div className="ui-error mt-3">{error}</div> : null}

      <div className="mt-4 flex flex-col gap-2">
        {items.map((n) => {
          const href = renderLink(n);
          const handled = handledFriendRequests[n.id] ?? null;
          const friendUid = n.type === 'friend_request_received' ? userIdForFriendRequest(n) : null;
          const friendActionLabel = handled ? (handled === 'accepted' ? 'Accepted' : 'Rejected') : n.isRead ? 'Handled' : null;
          return (
            <div key={n.id} className="ui-appear-up">
              <div
                className={`ui-panel ui-panel-soft p-3 ${n.isRead ? '' : 'ring-1'}`}
                style={
                  n.isRead
                    ? undefined
                    : {
                        boxShadow: '0 0 0 1px rgb(var(--ui-accent-rgb) / 0.55) inset',
                      }
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{renderText(n)}</div>
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      <Timestamp value={n.createdAt} />
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {href ? (
                        <button
                          onClick={() => void openNotification(n)}
                          disabled={busyId === n.id}
                          className="ui-link text-sm disabled:opacity-50"
                          type="button"
                        >
                          Open
                        </button>
                      ) : null}

                      {n.type === 'friend_request_received' && friendUid && !n.isRead && !handled ? (
                        <>
                          <button
                            disabled={busyId === n.id}
                            onClick={async () => {
                              const uid = friendUid;
                              setBusyId(n.id);
                              setError(null);
                              try {
                                await friendsApi.acceptRequest(uid);
                                await markReadIfNeeded(n);
                                setHandledFriendRequests((prev) => ({ ...prev, [n.id]: 'accepted' }));
                              } catch (err) {
                                setError(err instanceof Error ? err.message : 'Failed to accept');
                              } finally {
                                setBusyId(null);
                              }
                            }}
                            className="ui-btn ui-btn-primary disabled:opacity-50"
                            type="button"
                          >
                            Accept
                          </button>
                          <button
                            disabled={busyId === n.id}
                            onClick={async () => {
                              const uid = friendUid;
                              setBusyId(n.id);
                              setError(null);
                              try {
                                await friendsApi.rejectRequest(uid);
                                await markReadIfNeeded(n);
                                setHandledFriendRequests((prev) => ({ ...prev, [n.id]: 'rejected' }));
                              } catch (err) {
                                setError(err instanceof Error ? err.message : 'Failed to reject');
                              } finally {
                                setBusyId(null);
                              }
                            }}
                            className="ui-btn disabled:opacity-50"
                            type="button"
                          >
                            Reject
                          </button>
                        </>
                      ) : null}

                      {n.type === 'friend_request_received' && friendUid && friendActionLabel ? (
                        <div className="text-sm text-gray-700 dark:text-gray-300">
                          {friendActionLabel}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {!n.isRead ? (
                    <button
                      onClick={() => void markRead(n.id)}
                      disabled={busyId === n.id}
                      className="ui-btn px-2 py-1 text-xs"
                      type="button"
                    >
                      Mark read
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex justify-center">
        <button
          disabled={loading || !nextCursor}
          onClick={() => void load(false)}
          className="ui-btn px-4 py-2 disabled:opacity-50"
          type="button"
        >
          {nextCursor ? (loading ? 'Loading…' : 'Load more notifications') : 'No more notifications'}
        </button>
      </div>
    </div>
  );
}
