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
          <div className="absolute -left-12 top-6 h-44 w-44 rounded-full bg-[rgb(var(--ui-accent-rgb)_/_0.22)] blur-3xl" />
          <div className="absolute right-16 top-10 h-36 w-36 rounded-full bg-[rgb(var(--ui-accent-2-rgb)_/_0.18)] blur-3xl" />
          <div className="absolute bottom-0 left-1/3 h-28 w-64 -translate-x-1/2 rounded-full bg-[rgb(255_184_102_/_0.18)] blur-3xl" />
          <div className="absolute bottom-6 right-0 h-36 w-36 rounded-full bg-[rgb(150_230_255_/_0.2)] blur-3xl" />
        </div>

        <div className="relative">
          <div className="max-w-full">
            <div className="ui-kicker">Home feed</div>
            <h1 className="ui-h1 mt-4 text-3xl leading-tight sm:text-4xl lg:text-[3.2rem]">
              A brighter social feed with more glow, motion, <span className="ui-brand">and energy.</span>
            </h1>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="ui-btn ui-btn-primary px-6 py-3 text-base"
                onClick={() => window.scrollTo({ top: 340, behavior: 'smooth' })}
              >
                Jump into the feed
              </button>
              <div className="flex items-center gap-3 rounded-full border border-white/35 bg-white/40 px-4 py-2.5 text-sm text-gray-700 shadow-[0_18px_42px_-28px_rgb(var(--ui-shadow-rgb)_/_0.42)] backdrop-blur-xl dark:bg-white/10 dark:text-gray-200">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[linear-gradient(135deg,rgb(var(--ui-accent-rgb)_/_0.2),rgb(255_184_102_/_0.2),rgb(var(--ui-accent-2-rgb)_/_0.24))] text-[rgb(var(--ui-accent-text-rgb))]">
                  ✦
                </span>
                <span>Designed for quick scans and floating interactions</span>
              </div>
            </div>
          </div>
        </div>

        <div className="ui-divider-glow my-6" />

        <div className="relative grid gap-3 lg:grid-cols-3">
          <div className="rounded-[28px] border border-white/30 bg-white/36 p-4 shadow-[0_18px_42px_-30px_rgb(var(--ui-shadow-rgb)_/_0.45)] backdrop-blur-xl dark:bg-white/10">
            <div className="text-xs font-medium uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">Audience</div>
            <div className="mt-3 ui-segmented">
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
            <div className="ui-muted mt-3 text-xs">
              {scope === 'global' ? 'Open the feed to the whole network.' : 'Focus on updates from your friend circle.'}
            </div>
          </div>

          <div className="rounded-[28px] border border-white/30 bg-white/36 p-4 shadow-[0_18px_42px_-30px_rgb(var(--ui-shadow-rgb)_/_0.45)] backdrop-blur-xl dark:bg-white/10">
            <div className="text-xs font-medium uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">Ranking</div>
            <div className="mt-3 ui-segmented">
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
            <div className="ui-muted mt-3 text-xs">
              {sort === 'new' ? 'See the latest posts the moment they land.' : 'Let the most-liked posts rise to the top.'}
            </div>
          </div>

          <div className="rounded-[28px] border border-white/30 bg-white/36 p-4 shadow-[0_18px_42px_-30px_rgb(var(--ui-shadow-rgb)_/_0.45)] backdrop-blur-xl dark:bg-white/10">
            <div className="text-xs font-medium uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">Category</div>
            <select value={category} onChange={(event) => setCategory(event.target.value as PostCategory)} className="ui-input mt-3 min-w-0">
              {POST_CATEGORIES.map((option) => (
                <option key={option} value={option}>
                  {POST_CATEGORY_LABELS[option]}
                </option>
              ))}
            </select>
            <div className="ui-muted mt-3 text-xs">
              Browsing {POST_CATEGORY_LABELS[category].toLowerCase()} conversations right now.
            </div>
          </div>
        </div>

        {!props.currentUser ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[26px] border border-white/25 bg-white/35 px-4 py-3 text-sm shadow-[0_18px_35px_-26px_rgb(var(--ui-shadow-rgb)_/_0.5)] backdrop-blur-xl dark:bg-white/10">
            <span className="ui-muted">Log in to unlock friends-only posts and interactions.</span>
            <div className="flex flex-wrap gap-2">
              <Link to="/login" className="ui-btn rounded-full px-3 py-2">
                Login
              </Link>
              <Link to="/signup" className="ui-btn ui-btn-primary rounded-full px-3 py-2">
                Create account
              </Link>
            </div>
          </div>
        ) : null}
      </section>

      {canPost ? (
        <div className="space-y-4">
          <div className="ui-panel ui-panel-soft rounded-[28px] p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Post studio</div>
                <div className="ui-muted mt-1 max-w-2xl text-sm">
                  Open the full create and edit page when you need draft saving, scheduled publishing, or visibility controls.
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link to="/compose" className="ui-btn ui-btn-primary rounded-full px-4 py-2">
                  Open post studio
                </Link>
                <Link to="/collections" className="ui-btn rounded-full px-4 py-2">
                  View collections
                </Link>
              </div>
            </div>
          </div>

          <PostComposer currentUser={props.currentUser} onSubmit={submitPost} />
        </div>
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
                <Link to="/compose" className="ui-btn ui-btn-primary rounded-full px-4 py-2">
                  Create a post
                </Link>
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
