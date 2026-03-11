import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { postsApi } from '../lib/api';
import type { FeedPost, RealtimeEvent, User } from '../lib/types';
import { onRealtimeEvent } from '../lib/realtime';
import { PostComposer } from '../components/PostComposer';
import { PostCard } from '../components/PostCard';

export function FeedPage(props: { currentUser: User | null }) {
  const [sort, setSort] = useState<'new' | 'popular'>('new');
  const [scope, setScope] = useState<'global' | 'friends'>('global');
  const [items, setItems] = useState<FeedPost[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canPost = useMemo(() => Boolean(props.currentUser), [props.currentUser]);

  const load = async (reset: boolean) => {
    if (reset) {
      setItems([]);
      setNextCursor(null);
    }
    setLoading(true);
    setError(null);
    try {
      const res = await postsApi.feed({ sort, scope, cursor: reset ? null : nextCursor, limit: 20 });
      setItems((prev) => (reset ? res.items : [...prev, ...res.items]));
      setNextCursor(res.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load feed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, scope]);

  useEffect(() => {
    const off = onRealtimeEvent((event: RealtimeEvent) => {
      if (event.type === 'post_liked') {
        setItems((prev) =>
          prev.map((p) => {
            if (p.id !== event.postId) return p;
            const likedByMe =
              props.currentUser && event.userId === props.currentUser.id && typeof event.liked === 'boolean'
                ? event.liked
                : p.likedByMe;
            return { ...p, likeCount: event.likeCount, likedByMe };
          }),
        );
        return;
      }
      if (event.type === 'post_deleted') {
        setItems((prev) => prev.filter((p) => p.id !== event.postId));
        return;
      }
      if (event.type === 'post_created' || event.type === 'post_updated') {
        void load(true);
      }
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, scope, nextCursor]);

  const submitPost = async (input: { text: string; imageUrl?: string; visibility?: 'public' | 'friends' }) => {
    await postsApi.create(input);
    await load(true);
  };

  const updatePost = (post: FeedPost) => setItems((prev) => prev.map((p) => (p.id === post.id ? post : p)));
  const deletePost = (postId: number) => setItems((prev) => prev.filter((p) => p.id !== postId));

  const showInitialSkeletons = loading && items.length === 0;
  const isEmpty = !loading && items.length === 0;

  return (
    <div className="ui-shell-narrow space-y-5">
      <section className="ui-hero">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="ui-kicker">Home feed</div>
            <h1 className="ui-h1 mt-3 text-2xl sm:text-3xl">Catch the latest moments, not just the latest posts.</h1>
            <p className="ui-muted mt-2 max-w-xl text-sm sm:text-base">
              Switch between the global pulse and your friends circle, then sort for freshness or momentum.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="ui-badge ui-system">{scope === 'global' ? 'Global pulse' : 'Friends circle'}</span>
              <span className="ui-badge ui-system">{sort === 'new' ? 'Sorted by latest' : 'Sorted by popularity'}</span>
              <span className="ui-badge ui-system">Realtime updates on</span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:w-[25rem]">
            <div className="ui-stat ui-appear-up">
              <div className="ui-stat-value">{scope === 'global' ? 'Discover' : 'Stay close'}</div>
              <div className="ui-stat-label">Audience</div>
            </div>
            <div className="ui-stat ui-appear-up" style={{ animationDelay: '50ms' }}>
              <div className="ui-stat-value">{sort === 'new' ? 'Latest first' : 'Most loved'}</div>
              <div className="ui-stat-label">Sort mode</div>
            </div>
          </div>
        </div>

        <div className="ui-divider-glow my-5" />

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Audience</div>
              <div className="mt-2 ui-segmented">
                <button
                  onClick={() => setScope('global')}
                  className={`ui-segment ${scope === 'global' ? 'ui-segment-active' : ''}`}
                  type="button"
                >
                  Global
                </button>
                <button
                  disabled={!props.currentUser}
                  onClick={() => setScope('friends')}
                  className={`ui-segment ${scope === 'friends' ? 'ui-segment-active' : ''} disabled:cursor-not-allowed disabled:opacity-50`}
                  type="button"
                >
                  Friends
                </button>
              </div>
            </div>

            <div>
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Ranking</div>
              <div className="mt-2 ui-segmented">
                <button
                  onClick={() => setSort('new')}
                  className={`ui-segment ${sort === 'new' ? 'ui-segment-active' : ''}`}
                  type="button"
                >
                  New
                </button>
                <button
                  onClick={() => setSort('popular')}
                  className={`ui-segment ${sort === 'popular' ? 'ui-segment-active' : ''}`}
                  type="button"
                >
                  Popular
                </button>
              </div>
            </div>
          </div>

          {!props.currentUser ? (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[rgb(var(--ui-border-rgb)_/_0.65)] bg-white/40 px-3 py-3 text-sm dark:bg-white/5">
              <span className="ui-muted">Log in to unlock friends-only posts and interactions.</span>
              <Link to="/login" className="ui-btn rounded-full px-3 py-2">
                Login
              </Link>
              <Link to="/signup" className="ui-btn ui-btn-primary rounded-full px-3 py-2">
                Create account
              </Link>
            </div>
          ) : null}
        </div>
      </section>

      {canPost ? (
        <PostComposer currentUser={props.currentUser} onSubmit={submitPost} />
      ) : (
        <div className="ui-empty ui-appear-up">
          <div className="ui-empty-icon">✍️</div>
          <h2 className="ui-h2">Start posting once you join</h2>
          <p className="ui-muted mx-auto mt-2 max-w-md text-sm">
            Sign in to publish updates, like posts, and keep up with your friends in realtime.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Link to="/login" className="ui-btn rounded-full px-4 py-2">
              Login
            </Link>
            <Link to="/signup" className="ui-btn ui-btn-primary rounded-full px-4 py-2">
              Join now
            </Link>
          </div>
        </div>
      )}

      {error ? <div className="ui-error">{error}</div> : null}

      <section className="space-y-3">
        {showInitialSkeletons ? (
          <>
            {[0, 1, 2].map((i) => (
              <div key={i} className="ui-panel ui-panel-soft p-4 ui-appear-up" style={{ animationDelay: `${i * 60}ms` }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 gap-3">
                    <div className="ui-skeleton h-11 w-11 rounded-2xl" />
                    <div className="min-w-0 flex-1">
                      <div className="ui-skeleton h-4 w-32" />
                      <div className="ui-skeleton mt-2 h-3 w-52" />
                    </div>
                  </div>
                  <div className="ui-skeleton h-7 w-16" />
                </div>
                <div className="ui-skeleton mt-4 h-16 w-full" />
                <div className="ui-skeleton mt-3 h-44 w-full rounded-2xl" />
              </div>
            ))}
          </>
        ) : isEmpty ? (
          <div className="ui-empty ui-appear-up">
            <div className="ui-empty-icon">✨</div>
            <h2 className="ui-h2">Nothing here yet</h2>
            <p className="ui-muted mx-auto mt-2 max-w-md text-sm">
              {scope === 'friends'
                ? 'Your friends feed is quiet right now. Try switching to Global or share the first update yourself.'
                : 'The feed is empty for this view. Switch filters or publish something to get the conversation moving.'}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {scope === 'friends' ? (
                <button type="button" className="ui-btn rounded-full px-4 py-2" onClick={() => setScope('global')}>
                  View global feed
                </button>
              ) : null}
              {props.currentUser ? (
                <button type="button" className="ui-btn ui-btn-primary rounded-full px-4 py-2" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
                  Create a post
                </button>
              ) : (
                <Link to="/signup" className="ui-btn ui-btn-primary rounded-full px-4 py-2">
                  Join to start posting
                </Link>
              )}
            </div>
          </div>
        ) : (
          items.map((post, index) => (
            <div key={post.id} className="ui-appear-up" style={{ animationDelay: `${Math.min(index * 40, 200)}ms` }}>
              <PostCard post={post} currentUser={props.currentUser} onChange={updatePost} onDelete={deletePost} />
            </div>
          ))
        )}
      </section>

      {items.length > 0 ? (
        <div className="flex justify-center pt-2">
          <button
            disabled={loading || !nextCursor}
            onClick={() => void load(false)}
            className="ui-btn rounded-full px-5 py-2.5 disabled:opacity-50"
            type="button"
          >
            {nextCursor ? (loading ? 'Loading more…' : 'Load more posts') : 'You’re all caught up'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
