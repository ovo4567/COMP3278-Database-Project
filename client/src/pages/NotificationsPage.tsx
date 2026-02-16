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

  type RenderItem =
    | { kind: 'single'; n: NotificationItem }
    | { kind: 'group'; key: string; items: NotificationItem[]; representative: NotificationItem };

  const renderItems = useMemo<RenderItem[]>(() => {
    const out: RenderItem[] = [];
    const groups = new Map<string, { idx: number; items: NotificationItem[]; representative: NotificationItem }>();

    for (const n of items) {
      if (n.type === 'message_received' && n.entity?.type === 'chat_group' && typeof n.entity.id === 'number') {
        const key = `msg:${n.entity.id}`;
        const existing = groups.get(key);
        if (existing) {
          existing.items.push(n);
          continue;
        }

        const group = { idx: out.length, items: [n], representative: n };
        groups.set(key, group);
        out.push({ kind: 'group', key, items: group.items, representative: group.representative });
        continue;
      }

      out.push({ kind: 'single', n });
    }

    return out;
  }, [items]);

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

  const markManyRead = async (ids: number[]) => {
    if (ids.length === 0) return;
    setError(null);
    try {
      await notificationsApi.markRead(ids);
      setItems((prev) => {
        const beforeUnread = prev.filter((n) => !n.isRead && ids.includes(n.id)).length;
        if (beforeUnread) props.onUnreadCountChange((n) => Math.max(0, n - beforeUnread));
        return prev.map((n) => (ids.includes(n.id) ? { ...n, isRead: true } : n));
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark read');
    }
  };

  const markReadIfNeeded = async (n: NotificationItem) => {
    if (n.isRead) return;
    await markRead(n.id);
  };

  const userIdForFriendRequest = (n: NotificationItem): number | null => {
    if (n.entity?.type === 'user' && typeof n.entity.id === 'number') return n.entity.id;
    if (n.actorUser && typeof n.actorUser.id === 'number') return n.actorUser.id;
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
    if (n.type === 'message_received') return `New message in chat`;
    return n.type;
  };

  const renderGroupedText = (rep: NotificationItem, count: number) => {
    if (rep.type === 'message_received') {
      return count > 1 ? `New messages in chat (${count})` : 'New message in chat';
    }
    return renderText(rep);
  };

  const renderLink = (n: NotificationItem) => {
    if (n.type === 'message_received' && n.entity?.type === 'chat_group') {
      return `/chat?groupId=${encodeURIComponent(String(n.entity.id))}`;
    }
    if ((n.type === 'friend_request_received' || n.type === 'friend_request_accepted') && n.actorUser?.username) {
      return `/u/${encodeURIComponent(n.actorUser.username)}`;
    }
    if (n.entity?.type === 'post') {
      return `/p/${encodeURIComponent(String(n.entity.id))}`;
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
          <div className="ui-muted mt-1 text-xs">Unread, friend requests, and messages.</div>
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
        {renderItems.map((ri) => {
          if (ri.kind === 'single') {
            const n = ri.n;
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
          }

          const rep = ri.representative;
          const href = renderLink(rep);
          const ids = ri.items.map((x) => x.id);
          const isRead = ri.items.every((x) => x.isRead);

          const openGroup = async () => {
            if (!href) return;
            setBusyId(rep.id);
            setError(null);
            try {
              if (!isRead) await markManyRead(ids);
              navigate(href);
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Failed to open');
            } finally {
              setBusyId(null);
            }
          };

          return (
            <div key={ri.key} className="ui-appear-up">
              <div
                className={`ui-panel ui-panel-soft p-3 ${isRead ? '' : 'ring-1'}`}
                style={
                  isRead
                    ? undefined
                    : {
                        boxShadow: '0 0 0 1px rgb(var(--ui-accent-rgb) / 0.55) inset',
                      }
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{renderGroupedText(rep, ri.items.length)}</div>
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      <Timestamp value={rep.createdAt} />
                    </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {href ? (
                      <button
                        onClick={() => void openGroup()}
                        disabled={busyId === rep.id}
                        className="ui-link text-sm disabled:opacity-50"
                        type="button"
                      >
                        Open
                      </button>
                    ) : null}
                  </div>
                </div>

                {!isRead ? (
                  <button
                    onClick={() => void markManyRead(ids)}
                    disabled={busyId === rep.id}
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
          {nextCursor ? (loading ? 'Loading…' : 'Load more') : 'No more'}
        </button>
      </div>
    </div>
  );
}
