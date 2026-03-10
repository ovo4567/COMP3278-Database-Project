import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { adminApi, authApi, friendsApi, notificationsApi, postsApi, usersApi } from '../lib/api';
import type { FriendRequestItem, FriendUser, User, UserProfile } from '../lib/types';
import { requestUnreadRefresh } from '../lib/notificationsSync';
import { Timestamp } from '../components/Timestamp';

type Props = {
  currentUser: User | null;
  onUserUpdated: (u: User | null) => void;
};

export function ProfilePage({ currentUser, onUserUpdated }: Props) {
  const { username } = useParams();
  const navigate = useNavigate();
  const [items, setItems] = useState<Array<{ id: number; text: string; imageUrl: string | null; likeCount: number; createdAt: string }>>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [friendBusy, setFriendBusy] = useState(false);

  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [friendsNextCursor, setFriendsNextCursor] = useState<number | null>(null);
  const [requestsReceived, setRequestsReceived] = useState<FriendRequestItem[]>([]);
  const [requestsReceivedNextCursor, setRequestsReceivedNextCursor] = useState<number | null>(null);
  const [requestsSent, setRequestsSent] = useState<FriendRequestItem[]>([]);
  const [requestsSentNextCursor, setRequestsSentNextCursor] = useState<number | null>(null);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [friendsLoadingMore, setFriendsLoadingMore] = useState(false);
  const [requestsReceivedLoadingMore, setRequestsReceivedLoadingMore] = useState(false);
  const [requestsSentLoadingMore, setRequestsSentLoadingMore] = useState(false);
  const [friendsError, setFriendsError] = useState<string | null>(null);

  const isMe = useMemo(() => {
    return Boolean(currentUser && username && currentUser.username === username);
  }, [currentUser, username]);

  const isAdminViewingOther = useMemo(() => {
    return Boolean(currentUser?.role === 'admin' && username && currentUser.username !== username);
  }, [currentUser?.role, currentUser?.username, username]);

  const [editDisplayName, setEditDisplayName] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editAvatarUrl, setEditAvatarUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);

  const [adminUser, setAdminUser] = useState<{ isBanned: boolean } | null>(null);
  const [adminUserLoading, setAdminUserLoading] = useState(false);
  const [adminUserError, setAdminUserError] = useState<string | null>(null);

  const load = async (reset: boolean) => {
    if (!username) return;
    setLoading(true);
    setError(null);
    try {
      const res = await postsApi.byUser({ username, cursor: reset ? null : nextCursor, limit: 20 });
      setItems((prev) => (reset ? res.items : [...prev, ...res.items]));
      setNextCursor(res.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load posts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  useEffect(() => {
    const run = async () => {
      if (!username) return;
      setProfileLoading(true);
      setProfileError(null);
      try {
        const p = await usersApi.getProfile(username);
        setProfile(p);
      } catch (err) {
        setProfile(null);
        setProfileError(err instanceof Error ? err.message : 'Failed to load profile');
      } finally {
        setProfileLoading(false);
      }
    };

    void run();
  }, [username]);

  const loadFriendsSection = async () => {
    if (!username) return;

    setFriendsLoading(true);
    setFriendsError(null);
    try {
      if (isMe) {
        if (!currentUser) {
          setFriends([]);
          setFriendsNextCursor(null);
          setRequestsReceived([]);
          setRequestsReceivedNextCursor(null);
          setRequestsSent([]);
          setRequestsSentNextCursor(null);
          return;
        }
        const [f, rcv, sent] = await Promise.all([
          friendsApi.listMine({ limit: 20, cursor: null }),
          friendsApi.listRequestsReceived({ limit: 20, cursor: null }),
          friendsApi.listRequestsSent({ limit: 20, cursor: null }),
        ]);
        setFriends(f.items);
        setFriendsNextCursor(f.nextCursor);
        setRequestsReceived(rcv.items);
        setRequestsReceivedNextCursor(rcv.nextCursor);
        setRequestsSent(sent.items);
        setRequestsSentNextCursor(sent.nextCursor);
      } else {
        // Friends list is not viewable for other users.
        setFriends([]);
        setFriendsNextCursor(null);
        setRequestsReceived([]);
        setRequestsReceivedNextCursor(null);
        setRequestsSent([]);
        setRequestsSentNextCursor(null);
      }
    } catch (err) {
      setFriendsError(err instanceof Error ? err.message : 'Failed to load friends');
    } finally {
      setFriendsLoading(false);
    }
  };

  useEffect(() => {
    void loadFriendsSection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, isMe, currentUser?.id]);

  const loadMoreFriends = async () => {
    if (!currentUser || !isMe || !friendsNextCursor) return;
    setFriendsLoadingMore(true);
    setFriendsError(null);
    try {
      const res = await friendsApi.listMine({ limit: 20, cursor: friendsNextCursor });
      setFriends((prev) => [...prev, ...res.items]);
      setFriendsNextCursor(res.nextCursor);
    } catch (err) {
      setFriendsError(err instanceof Error ? err.message : 'Failed to load more friends');
    } finally {
      setFriendsLoadingMore(false);
    }
  };

  const loadMoreRequestsReceived = async () => {
    if (!currentUser || !isMe || !requestsReceivedNextCursor) return;
    setRequestsReceivedLoadingMore(true);
    setFriendsError(null);
    try {
      const res = await friendsApi.listRequestsReceived({ limit: 20, cursor: requestsReceivedNextCursor });
      setRequestsReceived((prev) => [...prev, ...res.items]);
      setRequestsReceivedNextCursor(res.nextCursor);
    } catch (err) {
      setFriendsError(err instanceof Error ? err.message : 'Failed to load more requests');
    } finally {
      setRequestsReceivedLoadingMore(false);
    }
  };

  const loadMoreRequestsSent = async () => {
    if (!currentUser || !isMe || !requestsSentNextCursor) return;
    setRequestsSentLoadingMore(true);
    setFriendsError(null);
    try {
      const res = await friendsApi.listRequestsSent({ limit: 20, cursor: requestsSentNextCursor });
      setRequestsSent((prev) => [...prev, ...res.items]);
      setRequestsSentNextCursor(res.nextCursor);
    } catch (err) {
      setFriendsError(err instanceof Error ? err.message : 'Failed to load more requests');
    } finally {
      setRequestsSentLoadingMore(false);
    }
  };

  const refreshProfile = async () => {
    if (!username) return;
    try {
      const p = await usersApi.getProfile(username);
      setProfile(p);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Failed to refresh profile');
    }
  };

  const setFriendshipLocal = (next: UserProfile['friendship']) => {
    setProfile((prev) => (prev ? { ...prev, friendship: next } : prev));
  };

  useEffect(() => {
    if (!profile) return;
    setEditDisplayName(profile.displayName ?? '');
    setEditStatus(profile.status ?? '');
    setEditBio(profile.bio ?? '');
    setEditAvatarUrl(profile.avatarUrl ?? '');
  }, [profile?.id]);

  useEffect(() => {
    const run = async () => {
      if (!profile || !isAdminViewingOther) {
        setAdminUser(null);
        return;
      }

      setAdminUserLoading(true);
      setAdminUserError(null);
      try {
        const res = await adminApi.getUser(profile.id);
        setAdminUser({ isBanned: res.isBanned });
      } catch (err) {
        setAdminUser(null);
        setAdminUserError(err instanceof Error ? err.message : 'Failed to load admin state');
      } finally {
        setAdminUserLoading(false);
      }
    };

    void run();
  }, [profile?.id, isAdminViewingOther]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">@{username}</h1>
        <Link to="/" className="text-sm underline">
          Back to feed
        </Link>
      </div>

      {profileLoading ? <div className="mt-3 text-sm text-gray-700 dark:text-gray-300">Loading profile…</div> : null}
      {profileError ? <div className="mt-3 text-sm text-red-600">{profileError}</div> : null}

      {profile ? (
        <div className="mt-4 rounded-lg border bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-start gap-3">
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt="Avatar"
                className="h-14 w-14 rounded-md border object-cover"
                loading="lazy"
              />
            ) : (
              <div className="h-14 w-14 rounded-md border bg-gray-50 dark:border-gray-800 dark:bg-gray-950" />
            )}
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{profile.displayName ?? `@${profile.username}`}</div>
              {profile.status ? <div className="mt-0.5 text-sm text-gray-700 dark:text-gray-300">{profile.status}</div> : null}
              {profile.bio ? <div className="mt-1 whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200">{profile.bio}</div> : null}
              {profile.stats ? (
                <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                  Posts {profile.stats.postCount} • Likes received {profile.stats.likesReceived}
                </div>
              ) : null}
              {typeof profile.friendCount === 'number' ? (
                <div className="mt-1 text-xs text-gray-600 dark:text-gray-400">Friends {profile.friendCount}</div>
              ) : null}
              <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">Joined <Timestamp value={profile.createdAt} variant="date" /></div>

              <div className="mt-3 flex flex-wrap gap-2">
                {!isMe && currentUser && profile.id ? (
                  <>
                    {(!profile.friendship || profile.friendship.status === 'rejected') ? (
                      <button
                        disabled={friendBusy}
                        onClick={async () => {
                          setProfileError(null);
                          setFriendBusy(true);
                          try {
                            const res = await friendsApi.sendRequest(profile.id);
                            if (currentUser) {
                              setFriendshipLocal({ status: res.status, actionUserId: currentUser.id });
                            }
                            await refreshProfile();
                          } catch (err) {
                            setProfileError(err instanceof Error ? err.message : 'Failed to send friend request');
                          } finally {
                            setFriendBusy(false);
                          }
                        }}
                        className="rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-800 dark:hover:bg-gray-800"
                        type="button"
                      >
                        Add friend
                      </button>
                    ) : null}

                    {profile.friendship?.status === 'pending' && profile.friendship.actionUserId === currentUser.id ? (
                      <button
                        disabled={friendBusy}
                        onClick={async () => {
                          setProfileError(null);
                          setFriendBusy(true);
                          try {
                            await friendsApi.cancelRequest(profile.id);
                            setFriendshipLocal(null);
                            await refreshProfile();
                          } catch (err) {
                            setProfileError(err instanceof Error ? err.message : 'Failed to cancel request');
                          } finally {
                            setFriendBusy(false);
                          }
                        }}
                        className="rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-800 dark:hover:bg-gray-800"
                        type="button"
                      >
                        Cancel request
                      </button>
                    ) : null}

                    {profile.friendship?.status === 'pending' && profile.friendship.actionUserId !== currentUser.id ? (
                      <>
                        <button
                          disabled={friendBusy}
                          onClick={async () => {
                            setProfileError(null);
                            setFriendBusy(true);
                            try {
                              await friendsApi.acceptRequest(profile.id);
                              try {
                                await notificationsApi.markReadByEntity({
                                  entityType: 'user',
                                  entityId: profile.id,
                                  types: ['friend_request_received'],
                                });
                                requestUnreadRefresh();
                              } catch {
                                // Non-fatal
                              }
                              setFriendshipLocal({ status: 'accepted', actionUserId: null });
                              await refreshProfile();
                            } catch (err) {
                              setProfileError(err instanceof Error ? err.message : 'Failed to accept request');
                            } finally {
                              setFriendBusy(false);
                            }
                          }}
                          className="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white transition-colors disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900"
                          type="button"
                        >
                          Accept
                        </button>
                        <button
                          disabled={friendBusy}
                          onClick={async () => {
                            setProfileError(null);
                            setFriendBusy(true);
                            try {
                              await friendsApi.rejectRequest(profile.id);
                              try {
                                await notificationsApi.markReadByEntity({
                                  entityType: 'user',
                                  entityId: profile.id,
                                  types: ['friend_request_received'],
                                });
                                requestUnreadRefresh();
                              } catch {
                                // Non-fatal
                              }
                              setFriendshipLocal({ status: 'rejected', actionUserId: null });
                              await refreshProfile();
                            } catch (err) {
                              setProfileError(err instanceof Error ? err.message : 'Failed to reject request');
                            } finally {
                              setFriendBusy(false);
                            }
                          }}
                          className="rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-800 dark:hover:bg-gray-800"
                          type="button"
                        >
                          Reject
                        </button>
                      </>
                    ) : null}

                    {profile.friendship?.status === 'accepted' ? (
                      <button
                        disabled={friendBusy}
                        onClick={async () => {
                          if (!confirm('Remove friend?')) return;
                          setProfileError(null);
                          setFriendBusy(true);
                          try {
                            await friendsApi.unfriend(profile.id);
                            setFriendshipLocal(null);
                            await refreshProfile();
                          } catch (err) {
                            setProfileError(err instanceof Error ? err.message : 'Failed to unfriend');
                          } finally {
                            setFriendBusy(false);
                          }
                        }}
                        className="rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-800 dark:hover:bg-gray-800"
                        type="button"
                      >
                        Unfriend
                      </button>
                    ) : null}
                  </>
                ) : null}

                {isAdminViewingOther ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {adminUserLoading ? <div className="text-xs text-gray-600">Loading admin tools…</div> : null}
                    {adminUserError ? <div className="text-xs text-red-600">{adminUserError}</div> : null}

                    {adminUser ? (
                      <button
                        onClick={async () => {
                          try {
                            const next = !adminUser.isBanned;
                            await adminApi.setUserBanned(profile.id, next);
                            setAdminUser({ isBanned: next });
                          } catch (err) {
                            setAdminUserError(err instanceof Error ? err.message : 'Failed to update ban');
                          }
                        }}
                        className="rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800"
                        type="button"
                      >
                        {adminUser.isBanned ? 'Unban user' : 'Ban user'}
                      </button>
                    ) : null}

                    <button
                      onClick={async () => {
                        if (!confirm('Delete this user? This will delete their posts, comments, and likes.')) return;
                        try {
                          await adminApi.deleteUser(profile.id);
                          navigate('/');
                        } catch (err) {
                          setAdminUserError(err instanceof Error ? err.message : 'Failed to delete user');
                        }
                      }}
                      className="rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800"
                      type="button"
                    >
                      Delete user
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {isMe ? (
            <div className="mt-4 border-t pt-4">
              <div className="text-sm font-semibold">Friends</div>
              {friendsLoading ? <div className="mt-2 text-sm text-gray-700 dark:text-gray-300">Loading friends…</div> : null}
              {friendsError ? <div className="mt-2 text-sm text-red-600">{friendsError}</div> : null}
              {!currentUser ? <div className="mt-2 text-sm text-gray-700 dark:text-gray-300">Login to view friends and requests.</div> : null}

              <div className="mt-3">
                <div className="text-xs text-gray-600 dark:text-gray-400">Accepted ({friends.length})</div>
                <div className="mt-2 grid gap-2">
                  {friends.map((u) => (
                    <div key={u.id} className="flex items-center justify-between rounded-md border bg-white p-2 dark:border-gray-800 dark:bg-gray-900">
                      <div className="flex min-w-0 items-center gap-2">
                        {u.avatarUrl ? (
                          <img src={u.avatarUrl} alt="Avatar" className="h-8 w-8 rounded-md border object-cover" loading="lazy" />
                        ) : (
                          <div className="h-8 w-8 rounded-md border bg-gray-50 dark:border-gray-800 dark:bg-gray-950" />
                        )}
                        <div className="min-w-0">
                          <div className="truncate text-sm text-gray-900 dark:text-gray-100">{u.displayName ?? `@${u.username}`}</div>
                          <div className="truncate text-xs text-gray-500 dark:text-gray-400">@{u.username}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Link to={`/u/${encodeURIComponent(u.username)}`} className="text-sm text-gray-700 underline dark:text-gray-300">
                          View
                        </Link>
                        <button
                          disabled={friendBusy}
                          onClick={async () => {
                            if (!confirm('Remove friend?')) return;
                            setFriendBusy(true);
                            setFriendsError(null);
                            try {
                              await friendsApi.unfriend(u.id);
                              await Promise.all([refreshProfile(), loadFriendsSection()]);
                            } catch (err) {
                              setFriendsError(err instanceof Error ? err.message : 'Failed to unfriend');
                            } finally {
                              setFriendBusy(false);
                            }
                          }}
                          className="rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-800 dark:hover:bg-gray-800"
                          type="button"
                        >
                          Unfriend
                        </button>
                      </div>
                    </div>
                  ))}
                  {friends.length === 0 && !friendsLoading && currentUser ? (
                    <div className="text-sm text-gray-700 dark:text-gray-300">No friends yet.</div>
                  ) : null}
                </div>

                <div className="mt-3 flex justify-center">
                  <button
                    disabled={!friendsNextCursor || friendsLoadingMore}
                    onClick={() => void loadMoreFriends()}
                    className="rounded-md border bg-white px-4 py-2 text-sm transition-colors disabled:opacity-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800"
                    type="button"
                  >
                    {friendsNextCursor ? (friendsLoadingMore ? 'Loading…' : 'Load more') : 'No more'}
                  </button>
                </div>
              </div>

              {currentUser ? (
              <div className="mt-4 grid gap-4">
                <div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">Requests received ({requestsReceived.length})</div>
                  <div className="mt-2 grid gap-2">
                    {requestsReceived.map((r) => (
                      <div key={r.user.id} className="flex items-center justify-between rounded-md border bg-white p-2 dark:border-gray-800 dark:bg-gray-900">
                        <div className="flex min-w-0 items-center gap-2">
                          {r.user.avatarUrl ? (
                            <img src={r.user.avatarUrl} alt="Avatar" className="h-8 w-8 rounded-md border object-cover" loading="lazy" />
                          ) : (
                            <div className="h-8 w-8 rounded-md border bg-gray-50 dark:border-gray-800 dark:bg-gray-950" />
                          )}
                          <div className="min-w-0">
                            <div className="truncate text-sm text-gray-900 dark:text-gray-100">{r.user.displayName ?? `@${r.user.username}`}</div>
                            <div className="truncate text-xs text-gray-500 dark:text-gray-400">@{r.user.username}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            disabled={friendBusy}
                            onClick={async () => {
                              setFriendBusy(true);
                              setFriendsError(null);
                              try {
                                await friendsApi.acceptRequest(r.user.id);
                                try {
                                  await notificationsApi.markReadByEntity({
                                    entityType: 'user',
                                    entityId: r.user.id,
                                    types: ['friend_request_received'],
                                  });
                                  requestUnreadRefresh();
                                } catch {
                                  // Non-fatal
                                }
                                await Promise.all([refreshProfile(), loadFriendsSection()]);
                              } catch (err) {
                                setFriendsError(err instanceof Error ? err.message : 'Failed to accept request');
                              } finally {
                                setFriendBusy(false);
                              }
                            }}
                            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white transition-colors disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900"
                            type="button"
                          >
                            Accept
                          </button>
                          <button
                            disabled={friendBusy}
                            onClick={async () => {
                              setFriendBusy(true);
                              setFriendsError(null);
                              try {
                                await friendsApi.rejectRequest(r.user.id);
                                try {
                                  await notificationsApi.markReadByEntity({
                                    entityType: 'user',
                                    entityId: r.user.id,
                                    types: ['friend_request_received'],
                                  });
                                  requestUnreadRefresh();
                                } catch {
                                  // Non-fatal
                                }
                                await Promise.all([refreshProfile(), loadFriendsSection()]);
                              } catch (err) {
                                setFriendsError(err instanceof Error ? err.message : 'Failed to reject request');
                              } finally {
                                setFriendBusy(false);
                              }
                            }}
                            className="rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-800 dark:hover:bg-gray-800"
                            type="button"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    ))}
                    {requestsReceived.length === 0 && !friendsLoading ? (
                      <div className="text-sm text-gray-700 dark:text-gray-300">No received requests.</div>
                    ) : null}
                  </div>

                  <div className="mt-3 flex justify-center">
                    <button
                      disabled={!requestsReceivedNextCursor || requestsReceivedLoadingMore}
                      onClick={() => void loadMoreRequestsReceived()}
                      className="rounded-md border bg-white px-4 py-2 text-sm transition-colors disabled:opacity-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800"
                      type="button"
                    >
                      {requestsReceivedNextCursor ? (requestsReceivedLoadingMore ? 'Loading…' : 'Load more') : 'No more'}
                    </button>
                  </div>
                </div>

                <div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">Requests sent ({requestsSent.length})</div>
                  <div className="mt-2 grid gap-2">
                    {requestsSent.map((r) => (
                      <div key={r.user.id} className="flex items-center justify-between rounded-md border bg-white p-2 dark:border-gray-800 dark:bg-gray-900">
                        <div className="flex min-w-0 items-center gap-2">
                          {r.user.avatarUrl ? (
                            <img src={r.user.avatarUrl} alt="Avatar" className="h-8 w-8 rounded-md border object-cover" loading="lazy" />
                          ) : (
                            <div className="h-8 w-8 rounded-md border bg-gray-50 dark:border-gray-800 dark:bg-gray-950" />
                          )}
                          <div className="min-w-0">
                            <div className="truncate text-sm text-gray-900 dark:text-gray-100">{r.user.displayName ?? `@${r.user.username}`}</div>
                            <div className="truncate text-xs text-gray-500 dark:text-gray-400">@{r.user.username}</div>
                          </div>
                        </div>
                        <button
                          disabled={friendBusy}
                          onClick={async () => {
                            setFriendBusy(true);
                            setFriendsError(null);
                            try {
                              await friendsApi.cancelRequest(r.user.id);
                              await Promise.all([refreshProfile(), loadFriendsSection()]);
                            } catch (err) {
                              setFriendsError(err instanceof Error ? err.message : 'Failed to cancel request');
                            } finally {
                              setFriendBusy(false);
                            }
                          }}
                          className="rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-800 dark:hover:bg-gray-800"
                          type="button"
                        >
                          Cancel
                        </button>
                      </div>
                    ))}
                    {requestsSent.length === 0 && !friendsLoading ? (
                      <div className="text-sm text-gray-700 dark:text-gray-300">No sent requests.</div>
                    ) : null}
                  </div>

                  <div className="mt-3 flex justify-center">
                    <button
                      disabled={!requestsSentNextCursor || requestsSentLoadingMore}
                      onClick={() => void loadMoreRequestsSent()}
                      className="rounded-md border bg-white px-4 py-2 text-sm transition-colors disabled:opacity-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800"
                      type="button"
                    >
                      {requestsSentNextCursor ? (requestsSentLoadingMore ? 'Loading…' : 'Load more') : 'No more'}
                    </button>
                  </div>
                </div>
              </div>
              ) : null}
            </div>
          ) : null}

          {isMe ? (
            <div className="mt-4 border-t pt-4">
              <div className="text-sm font-semibold">Edit profile</div>
              {saveError ? <div className="ui-error mt-2">{saveError}</div> : null}
              {saveOk ? <div className="mt-2 text-sm text-emerald-700 dark:text-emerald-300">Saved</div> : null}

              <div className="mt-3 grid gap-3">
                <label className="grid gap-1">
                  <div className="text-xs text-gray-600 dark:text-gray-400">Display name</div>
                  <input
                    value={editDisplayName}
                    onChange={(e) => {
                      setEditDisplayName(e.target.value);
                      setSaveOk(false);
                    }}
                    className="ui-input"
                    placeholder="Your name"
                  />
                </label>

                <label className="grid gap-1">
                  <div className="text-xs text-gray-600 dark:text-gray-400">Status</div>
                  <input
                    value={editStatus}
                    onChange={(e) => {
                      setEditStatus(e.target.value);
                      setSaveOk(false);
                    }}
                    className="ui-input"
                    placeholder="What’s up?"
                  />
                </label>

                <label className="grid gap-1">
                  <div className="text-xs text-gray-600 dark:text-gray-400">Bio</div>
                  <textarea
                    value={editBio}
                    onChange={(e) => {
                      setEditBio(e.target.value);
                      setSaveOk(false);
                    }}
                    className="ui-textarea min-h-24"
                    placeholder="Tell people about yourself"
                  />
                </label>

                <label className="grid gap-1">
                  <div className="text-xs text-gray-600 dark:text-gray-400">Avatar URL</div>
                  <input
                    value={editAvatarUrl}
                    onChange={(e) => {
                      setEditAvatarUrl(e.target.value);
                      setSaveOk(false);
                    }}
                    className="ui-input"
                    placeholder="https://…"
                  />
                </label>

                <div className="flex items-center justify-end gap-2">
                  <button
                    disabled={saving}
                    onClick={async () => {
                      setSaving(true);
                      setSaveError(null);
                      setSaveOk(false);
                      try {
                        const updated = await authApi.updateMe({
                          displayName: editDisplayName,
                          status: editStatus,
                          bio: editBio,
                          avatarUrl: editAvatarUrl,
                        });

                        onUserUpdated(updated);
                        setProfile(updated);
                        setSaveOk(true);
                      } catch (err) {
                        setSaveError(err instanceof Error ? err.message : 'Failed to save');
                      } finally {
                        setSaving(false);
                      }
                    }}
                    className="ui-btn ui-btn-primary px-4 py-2 disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? <div className="ui-error mt-4">{error}</div> : null}

      <div className="mt-4 flex flex-col gap-3">
        {items.map((p) => (
          <article key={p.id} className="ui-panel ui-panel-soft p-3">
            <div className="ui-muted text-xs">
              <Timestamp value={p.createdAt} />
            </div>
            {p.text ? (
              <div className="mt-1 whitespace-pre-wrap text-sm text-gray-900 dark:text-gray-100">{p.text}</div>
            ) : null}
            {p.imageUrl ? (
              <div className="mt-2">
                <img src={p.imageUrl} alt="Post" className="max-h-96 w-full rounded-md border object-contain" loading="lazy" />
              </div>
            ) : null}
            <div className="ui-muted mt-2 text-sm">Likes: {p.likeCount}</div>
          </article>
        ))}
      </div>

      <div className="mt-6 flex justify-center">
        <button
          disabled={loading || !nextCursor}
          onClick={() => void load(false)}
          className="ui-btn px-4 py-2 disabled:opacity-50"
        >
          {nextCursor ? (loading ? 'Loading…' : 'Load more') : 'No more'}
        </button>
      </div>
    </div>
  );
}
