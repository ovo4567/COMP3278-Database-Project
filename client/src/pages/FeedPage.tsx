import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { postsApi } from '../lib/api';
import { POST_CATEGORIES, POST_CATEGORY_LABELS, type FeedPost, type PostCategory, type RealtimeEvent, type User } from '../lib/types';
import { onRealtimeEvent } from '../lib/realtime';
import { PostComposer } from '../components/PostComposer';
import { PostCard } from '../components/PostCard';

export function FeedPage(props: { currentUser: User | null }) {
  const [sort, setSort] = useState<'new' | 'popular'>('new');
  const [scope, setScope] = useState<'global' | 'friends'>('global');
  const [category, setCategory] = useState<PostCategory>('all');
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
      const res = await postsApi.feed({ sort, scope, category, cursor: reset ? null : nextCursor, limit: 20 });
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
  }, [sort, scope, category]);

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
  }, [sort, scope, category, nextCursor]);

  const submitPost = async (input: { text: string; imageUrl?: string; visibility?: 'public' | 'friends'; category?: PostCategory }) => {
    await postsApi.create(input);
    await load(true);
  };

  const updatePost = (post: FeedPost) => setItems((prev) => prev.map((p) => (p.id === post.id ? post : p)));
  const deletePost = (postId: number) => setItems((prev) => prev.filter((p) => p.id !== postId));

  const showInitialSkeletons = loading && items.length === 0;
  const isEmpty = !loading && items.length === 0;

  return (
    <div className="ui-shell-narrow space-y-5">
      <section className="ui-hero ui-card-hover">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-10 top-6 h-36 w-36 rounded-full bg-[rgb(var(--ui-accent-rgb)_/_0.18)] blur-3xl" />
          <div className="absolute right-10 top-8 h-28 w-28 rounded-full bg-[rgb(var(--ui-accent-2-rgb)_/_0.18)] blur-3xl" />
          <div className="absolute bottom-0 left-1/3 h-24 w-56 -translate-x-1/2 rounded-full bg-[rgb(255_184_102_/_0.16)] blur-3xl" />
        </div>

        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="ui-kicker">Home feed</div>
            <h1 className="ui-h1 mt-3 text-3xl sm:text-4xl">A brighter social feed with more glow, motion, and energy.</h1>
            <p className="ui-muted mt-2 max-w-xl text-sm sm:text-base">
              Float between the global pulse and your inner circle, then sort for freshest drops or hottest momentum.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="ui-badge ui-system">{scope === 'global' ? 'Global pulse' : 'Friends circle'}</span>
              <span className="ui-badge ui-system">{sort === 'new' ? 'Fresh drop mode' : 'Heat check mode'}</span>
              <span className="ui-badge ui-system">{POST_CATEGORY_LABELS[category]} tag</span>
              <span className="ui-badge ui-system">Live updates on</span>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="ui-btn ui-btn-primary px-5 py-2.5"
                onClick={() => window.scrollTo({ top: 340, behavior: 'smooth' })}
              >
                Jump into the feed
              </button>
              <div className="rounded-full border border-white/30 bg-white/35 px-4 py-2 text-sm text-gray-700 backdrop-blur-xl dark:bg-white/10 dark:text-gray-200">
                <span className="mr-2 inline-flex h-2 w-2 rounded-full bg-[rgb(var(--ui-accent-rgb))] shadow-[0_0_14px_rgb(var(--ui-accent-rgb)_/_0.72)]" />
                Designed for quick scans and floating interactions
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:w-[28rem]">
            <div className="ui-stat ui-appear-up rotate-[-2deg]">
              <div className="ui-stat-value">{scope === 'global' ? 'Discover' : 'Close friends'}</div>
              <div className="ui-stat-label">Audience vibe</div>
              <div className="mt-3 text-sm text-gray-700 dark:text-gray-300">
                {scope === 'global' ? 'Open up the whole network and spot what is trending now.' : 'Keep it intimate with friend-only posts and replies.'}
              </div>
            </div>
            <div className="ui-stat ui-appear-up translate-y-3 rotate-[3deg]" style={{ animationDelay: '50ms' }}>
              <div className="ui-stat-value">{sort === 'new' ? 'Latest first' : 'Most loved'}</div>
              <div className="ui-stat-label">Sort mode</div>
              <div className="mt-3 text-sm text-gray-700 dark:text-gray-300">
                {sort === 'new' ? 'Catch every fresh post the moment it lands.' : 'Let the most liked moments rise to the top.'}
              </div>
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

            <div>
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Category</div>
              <select value={category} onChange={(event) => setCategory(event.target.value as PostCategory)} className="ui-input mt-2 min-w-44">
                {POST_CATEGORIES.map((option) => (
                  <option key={option} value={option}>
                    {POST_CATEGORY_LABELS[option]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {!props.currentUser ? (
            <div className="flex flex-wrap items-center gap-2 rounded-[24px] border border-white/25 bg-white/35 px-3 py-3 text-sm shadow-[0_18px_35px_-26px_rgb(var(--ui-shadow-rgb)_/_0.5)] backdrop-blur-xl dark:bg-white/10">
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
            {nextCursor ? (loading ? 'Loading more…' : 'Load more posts') : 'No more new posts'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
