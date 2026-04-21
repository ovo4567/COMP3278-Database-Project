import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { adminApi, authApi, friendsApi, notificationsApi, postsApi, usersApi } from '../lib/api';
import type { FeedPost, FriendRequestItem, FriendUser, User, UserProfile } from '../lib/types';
import { fileToAvatarDataUrl } from '../lib/avatarUpload';
import { requestUnreadRefresh } from '../lib/notificationsSync';
import { PostCard } from '../components/PostCard';
import { Timestamp } from '../components/Timestamp';

type Props = {
  currentUser: User | null;
  onUserUpdated: (u: User | null) => void;
};

type ProfileTab = 'posts' | 'about' | 'connections' | 'edit';

export function ProfilePage({ currentUser, onUserUpdated }: Props) {
  const { username } = useParams();
  const navigate = useNavigate();
  const [items, setItems] = useState<Array<Omit<FeedPost, 'user'>>>([]);
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

  const [editDisplayName, setEditDisplayName] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editAvatarUrl, setEditAvatarUrl] = useState('');
  const [avatarFileName, setAvatarFileName] = useState<string | null>(null);
  const [avatarProcessing, setAvatarProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);

  const [adminUser, setAdminUser] = useState<{ isBanned: boolean } | null>(null);
  const [adminUserLoading, setAdminUserLoading] = useState(false);
  const [adminUserError, setAdminUserError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ProfileTab>('posts');

  const isMe = useMemo(() => Boolean(currentUser && username && currentUser.username === username), [currentUser, username]);
  const isAdminViewingOther = useMemo(
    () => Boolean(currentUser?.role === 'admin' && username && currentUser.username !== username),
    [currentUser?.role, currentUser?.username, username],
  );

  useEffect(() => {
    setActiveTab('posts');
  }, [username]);

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
    setAvatarFileName(null);
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

  const profilePosts = useMemo(() => {
    if (!profile) return [] as FeedPost[];
    return items.map((item) => ({
      ...item,
      user: {
        username: profile.username,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
      },
    }));
  }, [items, profile]);

  const updateProfilePost = (updated: FeedPost) => {
    const { user, ...rest } = updated;
    void user;
    setItems((prev) =>
      prev.map((item) =>
        item.id === updated.id ? { ...item, ...rest } : item,
      ),
    );
  };

  const deleteProfilePost = (postId: number) => setItems((prev) => prev.filter((item) => item.id !== postId));

  const relationshipButtons = () => {
    if (!profile || isMe || !currentUser) return null;

    if (!profile.friendship || profile.friendship.status === 'rejected') {
      return (
        <button
          disabled={friendBusy}
          onClick={async () => {
            setProfileError(null);
            setFriendBusy(true);
            try {
              const res = await friendsApi.sendRequest(profile.id);
              setFriendshipLocal({ status: res.status, actionUserId: currentUser.id });
              await refreshProfile();
            } catch (err) {
              setProfileError(err instanceof Error ? err.message : 'Failed to send friend request');
            } finally {
              setFriendBusy(false);
            }
          }}
          className="ui-btn ui-btn-primary rounded-full px-4 py-2 disabled:opacity-50"
          type="button"
        >
          Add friend
        </button>
      );
    }

    if (profile.friendship.status === 'pending' && profile.friendship.actionUserId === currentUser.id) {
      return (
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
          className="ui-btn rounded-full px-4 py-2 disabled:opacity-50"
          type="button"
        >
          Cancel request
        </button>
      );
    }

    if (profile.friendship.status === 'pending' && profile.friendship.actionUserId !== currentUser.id) {
      return (
        <>
          <button
            disabled={friendBusy}
            onClick={async () => {
              setProfileError(null);
              setFriendBusy(true);
              try {
                await friendsApi.acceptRequest(profile.id);
                try {
                  await notificationsApi.markReadByActor({ actorUsername: profile.id, types: ['friend_request_received'] });
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
            className="ui-btn ui-btn-primary rounded-full px-4 py-2 disabled:opacity-50"
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
                  await notificationsApi.markReadByActor({ actorUsername: profile.id, types: ['friend_request_received'] });
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
            className="ui-btn rounded-full px-4 py-2 disabled:opacity-50"
            type="button"
          >
            Reject
          </button>
        </>
      );
    }

    if (profile.friendship.status === 'accepted') {
      return (
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
          className="ui-btn rounded-full px-4 py-2 disabled:opacity-50"
          type="button"
        >
          Unfriend
        </button>
      );
    }

    return null;
  };

  const connectionCard = (
    title: string,
    subtitle: string,
    children: ReactNode,
    footer?: React.ReactNode,
  ) => (
    <div className="ui-panel ui-panel-soft rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</div>
          <div className="ui-muted mt-1 text-xs">{subtitle}</div>
        </div>
      </div>
      <div className="mt-4 space-y-2">{children}</div>
      {footer ? <div className="mt-4">{footer}</div> : null}
    </div>
  );

  const personRow = (user: FriendUser, actions: React.ReactNode, helper?: ReactNode) => {
    const initials = user.displayName?.trim()?.charAt(0) ?? user.username.charAt(0);
    return (
      <div key={user.id} className="flex items-center justify-between gap-3 rounded-2xl border border-[rgb(var(--ui-border-rgb)_/_0.6)] bg-white/40 p-3 dark:bg-white/5">
        <div className="flex min-w-0 items-center gap-3">
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt="Avatar" className="h-11 w-11 rounded-2xl border object-cover" loading="lazy" />
          ) : (
            <div className="ui-avatar h-11 w-11 rounded-2xl text-xs uppercase">{initials}</div>
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{user.displayName ?? `@${user.username}`}</div>
            <div className="truncate text-xs text-gray-500 dark:text-gray-400">@{user.username}</div>
            {helper ? <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{helper}</div> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      </div>
    );
  };

  const tabs: Array<{ id: ProfileTab; label: string }> = [
    { id: 'posts', label: 'Posts' },
    { id: 'about', label: 'About' },
    ...(isMe ? ([{ id: 'connections', label: 'Connections' }, { id: 'edit', label: 'Edit profile' }] as const) : []),
  ];

  const profileInitials = profile?.displayName?.trim()?.charAt(0) ?? profile?.username?.charAt(0) ?? 'U';

  return (
    <div className="ui-shell space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="ui-kicker">Profile</div>
          <h1 className="ui-h1 mt-2">@{username}</h1>
        </div>
        <Link to="/" className="ui-btn rounded-full px-4 py-2">
          Back to feed
        </Link>
      </div>

      {profileLoading && !profile ? (
        <div className="ui-hero">
          <div className="flex items-start gap-4">
            <div className="ui-skeleton h-20 w-20 rounded-3xl" />
            <div className="min-w-0 flex-1">
              <div className="ui-skeleton h-6 w-40" />
              <div className="ui-skeleton mt-3 h-4 w-56" />
              <div className="ui-skeleton mt-4 h-20 w-full" />
            </div>
          </div>
        </div>
      ) : null}

      {profileError ? <div className="ui-error">{profileError}</div> : null}

      {profile ? (
        <>
          <section className="ui-hero ui-appear-up">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex min-w-0 flex-1 gap-4">
                {profile.avatarUrl ? (
                  <img src={profile.avatarUrl} alt="Avatar" className="h-20 w-20 rounded-3xl border object-cover shadow-lg" loading="lazy" />
                ) : (
                  <div className="ui-avatar h-20 w-20 rounded-3xl text-2xl uppercase">{profileInitials}</div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">
                      {profile.displayName ?? `@${profile.username}`}
                    </h2>
                    {isMe ? <span className="ui-badge">Your profile</span> : null}
                    {profile.friendship?.status === 'accepted' ? <span className="ui-badge">Friends</span> : null}
                    {adminUser?.isBanned ? <span className="ui-badge">Banned</span> : null}
                  </div>
                  <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">@{profile.username}</div>
                  {profile.status ? <div className="mt-3 text-sm font-medium text-gray-800 dark:text-gray-200">{profile.status}</div> : null}
                  {profile.bio ? <div className="mt-3 max-w-2xl whitespace-pre-wrap text-sm leading-6 text-gray-700 dark:text-gray-300">{profile.bio}</div> : null}
                  <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <span className="ui-badge">Joined <Timestamp value={profile.createdAt} variant="date" /></span>
                    {typeof profile.friendCount === 'number' ? <span className="ui-badge">{profile.friendCount} friends</span> : null}
                  </div>
                </div>
              </div>

              <div className="flex w-full flex-col gap-2 lg:w-auto lg:min-w-[16rem]">
                <div className="flex flex-wrap gap-2">
                  {relationshipButtons()}
                  {isMe ? (
                    <button type="button" className="ui-btn rounded-full px-4 py-2" onClick={() => setActiveTab('edit')}>
                      Edit profile
                    </button>
                  ) : null}
                </div>
                {isAdminViewingOther ? (
                  <div className="rounded-2xl border border-[rgb(var(--ui-border-rgb)_/_0.62)] bg-white/40 p-3 text-sm dark:bg-white/5">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Admin tools</div>
                    {adminUserLoading ? <div className="ui-muted mt-2 text-xs">Loading admin tools…</div> : null}
                    {adminUserError ? <div className="ui-error mt-2">{adminUserError}</div> : null}
                    <div className="mt-3 flex flex-wrap gap-2">
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
                          className="ui-btn rounded-full px-4 py-2"
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
                        className="ui-btn rounded-full px-4 py-2"
                        type="button"
                      >
                        Delete user
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="ui-stat ui-appear-up">
                <div className="ui-stat-value">{profile.stats?.postCount ?? items.length}</div>
                <div className="ui-stat-label">Posts</div>
              </div>
              <div className="ui-stat ui-appear-up" style={{ animationDelay: '45ms' }}>
                <div className="ui-stat-value">{profile.stats?.likesReceived ?? 0}</div>
                <div className="ui-stat-label">Likes received</div>
              </div>
              <div className="ui-stat ui-appear-up" style={{ animationDelay: '90ms' }}>
                <div className="ui-stat-value">{typeof profile.friendCount === 'number' ? profile.friendCount : 0}</div>
                <div className="ui-stat-label">Connections</div>
              </div>
            </div>
          </section>

          <div className="ui-tabbar">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`ui-tab ${activeTab === tab.id ? 'ui-tab-active' : ''}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'posts' ? (
            <section className="space-y-3">
              {error ? <div className="ui-error">{error}</div> : null}
              {profilePosts.length === 0 && !loading ? (
                <div className="ui-empty">
                  <div className="ui-empty-icon">🗂️</div>
                  <h2 className="ui-h2">No posts yet</h2>
                  <p className="ui-muted mx-auto mt-2 max-w-md text-sm">
                    {isMe ? 'Your posts will appear here once you share your first update.' : `${profile.displayName ?? `@${profile.username}`} has not posted yet.`}
                  </p>
                </div>
              ) : null}

              {profilePosts.map((post, index) => (
                <div key={post.id} className="ui-appear-up" style={{ animationDelay: `${Math.min(index * 40, 200)}ms` }}>
                  <PostCard post={post} currentUser={currentUser} onChange={updateProfilePost} onDelete={deleteProfilePost} />
                </div>
              ))}

              {profilePosts.length > 0 ? (
                <div className="flex justify-center pt-2">
                  <button
                    disabled={loading || !nextCursor}
                    onClick={() => void load(false)}
                    className="ui-btn rounded-full px-5 py-2.5 disabled:opacity-50"
                    type="button"
                  >
                    {nextCursor ? (loading ? 'Loading…' : 'Load more posts') : 'No more new posts'}
                  </button>
                </div>
              ) : null}
            </section>
          ) : null}

          {activeTab === 'about' ? (
            <section className="grid gap-4 lg:grid-cols-[1.35fr_0.95fr]">
              <div className="ui-panel ui-panel-soft rounded-2xl p-5">
                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">About</div>
                <div className="mt-4 space-y-4 text-sm text-gray-700 dark:text-gray-300">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Status</div>
                    <div className="mt-2">{profile.status || 'No status set yet.'}</div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Bio</div>
                    <div className="mt-2 whitespace-pre-wrap">{profile.bio || 'No bio provided yet.'}</div>
                  </div>
                </div>
              </div>

              <div className="ui-panel ui-panel-soft rounded-2xl p-5">
                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Highlights</div>
                <div className="mt-4 grid gap-3">
                  <div className="ui-stat">
                    <div className="ui-stat-value">
                      <Timestamp value={profile.createdAt} variant="date" />
                    </div>
                    <div className="ui-stat-label">Joined</div>
                  </div>
                  <div className="ui-stat">
                    <div className="ui-stat-value">{profile.stats?.likesReceived ?? 0}</div>
                    <div className="ui-stat-label">Total likes received</div>
                  </div>
                  <div className="ui-stat">
                    <div className="ui-stat-value">{profile.friendship?.status ?? (isMe ? 'self' : 'not connected')}</div>
                    <div className="ui-stat-label">Relationship</div>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {activeTab === 'connections' && isMe ? (
            <section className="space-y-4">
              {friendsError ? <div className="ui-error">{friendsError}</div> : null}
              {friendsLoading ? <div className="ui-panel ui-panel-soft rounded-2xl p-4 text-sm text-gray-700 dark:text-gray-300">Loading connections…</div> : null}

              <div className="grid gap-4 xl:grid-cols-3">
                {connectionCard(
                  `Friends (${friends.length})`,
                  'People you are already connected with.',
                  friends.length > 0
                    ? friends.map((u) =>
                        personRow(
                          u,
                          <>
                            <Link to={`/u/${encodeURIComponent(u.username)}`} className="ui-btn rounded-full px-3 py-1.5 text-xs">
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
                              className="ui-btn rounded-full px-3 py-1.5 text-xs disabled:opacity-50"
                              type="button"
                            >
                              Unfriend
                            </button>
                          </>,
                          u.status ?? undefined,
                        ),
                      )
                    : <div className="text-sm text-gray-700 dark:text-gray-300">No friends yet.</div>,
                  <button
                    disabled={!friendsNextCursor || friendsLoadingMore}
                    onClick={() => void loadMoreFriends()}
                    className="ui-btn rounded-full px-4 py-2 disabled:opacity-50"
                    type="button"
                  >
                    {friendsNextCursor ? (friendsLoadingMore ? 'Loading…' : 'Load more friends') : 'No more friends'}
                  </button>,
                )}

                {connectionCard(
                  `Requests received (${requestsReceived.length})`,
                  'Respond to incoming requests here.',
                  requestsReceived.length > 0
                    ? requestsReceived.map((request) =>
                        personRow(
                          request.user,
                          <>
                            <button
                              disabled={friendBusy}
                              onClick={async () => {
                                setFriendBusy(true);
                                setFriendsError(null);
                                try {
                                  await friendsApi.acceptRequest(request.user.id);
                                  try {
                                    await notificationsApi.markReadByActor({ actorUsername: request.user.id, types: ['friend_request_received'] });
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
                              className="ui-btn ui-btn-primary rounded-full px-3 py-1.5 text-xs disabled:opacity-50"
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
                                  await friendsApi.rejectRequest(request.user.id);
                                  try {
                                    await notificationsApi.markReadByActor({ actorUsername: request.user.id, types: ['friend_request_received'] });
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
                              className="ui-btn rounded-full px-3 py-1.5 text-xs disabled:opacity-50"
                              type="button"
                            >
                              Reject
                            </button>
                          </>,
                          <Timestamp value={request.createdAt} />,
                        ),
                      )
                    : <div className="text-sm text-gray-700 dark:text-gray-300">No received requests.</div>,
                  <button
                    disabled={!requestsReceivedNextCursor || requestsReceivedLoadingMore}
                    onClick={() => void loadMoreRequestsReceived()}
                    className="ui-btn rounded-full px-4 py-2 disabled:opacity-50"
                    type="button"
                  >
                    {requestsReceivedNextCursor ? (requestsReceivedLoadingMore ? 'Loading…' : 'Load more requests') : 'No more requests'}
                  </button>,
                )}

                {connectionCard(
                  `Requests sent (${requestsSent.length})`,
                  'Pending invites waiting on a response.',
                  requestsSent.length > 0
                    ? requestsSent.map((request) =>
                        personRow(
                          request.user,
                          <button
                            disabled={friendBusy}
                            onClick={async () => {
                              setFriendBusy(true);
                              setFriendsError(null);
                              try {
                                await friendsApi.cancelRequest(request.user.id);
                                await Promise.all([refreshProfile(), loadFriendsSection()]);
                              } catch (err) {
                                setFriendsError(err instanceof Error ? err.message : 'Failed to cancel request');
                              } finally {
                                setFriendBusy(false);
                              }
                            }}
                            className="ui-btn rounded-full px-3 py-1.5 text-xs disabled:opacity-50"
                            type="button"
                          >
                            Cancel
                          </button>,
                          <Timestamp value={request.createdAt} />,
                        ),
                      )
                    : <div className="text-sm text-gray-700 dark:text-gray-300">No sent requests.</div>,
                  <button
                    disabled={!requestsSentNextCursor || requestsSentLoadingMore}
                    onClick={() => void loadMoreRequestsSent()}
                    className="ui-btn rounded-full px-4 py-2 disabled:opacity-50"
                    type="button"
                  >
                    {requestsSentNextCursor ? (requestsSentLoadingMore ? 'Loading…' : 'Load more requests') : 'No more requests'}
                  </button>,
                )}
              </div>
            </section>
          ) : null}

          {activeTab === 'edit' && isMe ? (
            <section className="ui-panel ui-panel-soft rounded-2xl p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Edit profile</div>
                  <div className="ui-muted mt-1 text-sm">Update how you appear around the app.</div>
                </div>
                {saveOk ? <span className="ui-badge text-emerald-700 dark:text-emerald-300">Saved</span> : null}
              </div>

              {saveError ? <div className="ui-error mt-4">{saveError}</div> : null}

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
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

                <label className="grid gap-1 lg:col-span-2">
                  <div className="text-xs text-gray-600 dark:text-gray-400">Bio</div>
                  <textarea
                    value={editBio}
                    onChange={(e) => {
                      setEditBio(e.target.value);
                      setSaveOk(false);
                    }}
                    className="ui-textarea min-h-28"
                    placeholder="Tell people about yourself"
                  />
                </label>

                <label className="grid gap-1 lg:col-span-2">
                  <div className="text-xs text-gray-600 dark:text-gray-400">Avatar URL</div>
                  <div className="flex items-center gap-3">
                    {editAvatarUrl ? (
                      <img src={editAvatarUrl} alt="Avatar preview" className="h-14 w-14 rounded-2xl border object-cover" />
                    ) : (
                      <div className="ui-avatar h-14 w-14 rounded-2xl text-sm uppercase">
                        {profileInitials}
                      </div>
                    )}
                    <div className="min-w-0 text-xs text-gray-500 dark:text-gray-400">
                      {avatarFileName ? `Selected file: ${avatarFileName}` : 'Use an image URL or choose a local image file.'}
                    </div>
                  </div>
                  <input
                    value={editAvatarUrl}
                    onChange={(e) => {
                      setEditAvatarUrl(e.target.value);
                      setAvatarFileName(null);
                      setSaveOk(false);
                    }}
                    className="ui-input"
                    placeholder="https://…"
                  />
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="ui-btn rounded-full px-4 py-2 cursor-pointer">
                      {avatarProcessing ? 'Processing…' : 'Choose local image'}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={avatarProcessing || saving}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setAvatarProcessing(true);
                          setSaveError(null);
                          setSaveOk(false);
                          try {
                            const nextAvatar = await fileToAvatarDataUrl(file);
                            setEditAvatarUrl(nextAvatar);
                            setAvatarFileName(file.name);
                          } catch (err) {
                            setSaveError(err instanceof Error ? err.message : 'Failed to process image');
                          } finally {
                            setAvatarProcessing(false);
                            e.target.value = '';
                          }
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="ui-btn rounded-full px-4 py-2"
                      onClick={() => {
                        setEditAvatarUrl('');
                        setAvatarFileName(null);
                        setSaveOk(false);
                      }}
                    >
                      Clear avatar
                    </button>
                  </div>
                </label>
              </div>

              <div className="mt-5 flex justify-end">
                <button
                  disabled={saving || avatarProcessing}
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
                  className="ui-btn ui-btn-primary rounded-full px-5 py-2.5 disabled:opacity-50"
                  type="button"
                >
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
