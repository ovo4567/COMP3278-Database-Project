import { useEffect, useMemo, useState } from 'react';
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

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="ui-h1">Feed</h1>
          <div className="ui-muted mt-1 text-xs">Global pulse, friends, and updates.</div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setSort('new')}
            className={`${sort === 'new' ? 'ui-btn ui-btn-primary' : 'ui-btn'}`}
          >
            New
          </button>
          <button
            onClick={() => setSort('popular')}
            className={`${sort === 'popular' ? 'ui-btn ui-btn-primary' : 'ui-btn'}`}
          >
            Popular
          </button>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={() => setScope('global')}
          className={`${scope === 'global' ? 'ui-btn ui-btn-primary' : 'ui-btn'}`}
          type="button"
        >
          Global
        </button>
        <button
          disabled={!props.currentUser}
          onClick={() => setScope('friends')}
          className={`${scope === 'friends' ? 'ui-btn ui-btn-primary' : 'ui-btn'} disabled:opacity-50`}
          type="button"
        >
          Friends
        </button>
        {!props.currentUser ? <div className="ui-muted text-xs">Login for friends feed</div> : null}
      </div>

      {canPost ? (
        <div className="mt-4">
          <PostComposer onSubmit={submitPost} />
        </div>
      ) : (
        <div className="ui-panel ui-panel-soft mt-4 p-4 text-sm text-gray-700 dark:text-gray-300">
          Login to create posts and interact.
        </div>
      )}

      {error ? <div className="ui-error mt-4">{error}</div> : null}

      <div className="mt-4 flex flex-col gap-3">
        {showInitialSkeletons ? (
          <>
            {[0, 1, 2].map((i) => (
              <div key={i} className="ui-panel ui-panel-soft p-3 ui-appear-up">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="ui-skeleton h-4 w-40" />
                    <div className="ui-skeleton mt-2 h-3 w-56" />
                  </div>
                  <div className="ui-skeleton h-7 w-16" />
                </div>
                <div className="ui-skeleton mt-3 h-16 w-full" />
                <div className="mt-3 flex items-center justify-between">
                  <div className="ui-skeleton h-8 w-28" />
                  <div className="ui-skeleton h-4 w-20" />
                </div>
              </div>
            ))}
          </>
        ) : (
          items.map((post) => (
            <div key={post.id} className="ui-appear-up">
              <PostCard post={post} currentUser={props.currentUser} onChange={updatePost} onDelete={deletePost} />
            </div>
          ))
        )}
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
