import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { postsApi } from '../lib/api';
import type { FeedPost, User } from '../lib/types';
import { PostCard } from '../components/PostCard';

export function CollectionsPage(props: { currentUser: User | null }) {
  const [items, setItems] = useState<FeedPost[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (reset: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const res = await postsApi.collectionsMine({ limit: 20, cursor: reset ? null : nextCursor });
      setItems((prev) => (reset ? res.items : [...prev, ...res.items]));
      setNextCursor(res.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load collections');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!props.currentUser) return;
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.currentUser?.id]);

  if (!props.currentUser) return <Navigate to="/login" />;

  return (
    <div className="ui-shell-narrow space-y-5">
      <section className="ui-hero">
        <div className="ui-kicker">Collections</div>
        <h1 className="ui-h1 mt-3">Saved posts you want to revisit.</h1>
        <p className="ui-muted mt-2 max-w-2xl text-sm">
          Review everything you have collected, remove items when they are no longer useful, and keep your reading queue tidy.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to="/" className="ui-btn rounded-full px-4 py-2">
            Back to feed
          </Link>
          <Link to="/compose" className="ui-btn ui-btn-primary rounded-full px-4 py-2">
            Create post
          </Link>
        </div>
      </section>

      {error ? <div className="ui-error">{error}</div> : null}

      {items.length === 0 && !loading ? (
        <div className="ui-empty">
          <div className="ui-empty-icon">□</div>
          <h2 className="ui-h2">No collected posts yet</h2>
          <p className="ui-muted mx-auto mt-2 max-w-md text-sm">
            Collect posts from the feed or post detail page to build your own reading shelf.
          </p>
          <div className="mt-4">
            <Link to="/" className="ui-btn ui-btn-primary rounded-full px-4 py-2">
              Explore the feed
            </Link>
          </div>
        </div>
      ) : (
        <section className="space-y-3">
          {items.map((post) => (
            <PostCard key={post.id} post={post} currentUser={props.currentUser} onChange={(updated) => {
              setItems((prev) => {
                if (updated.collectedByMe === false) return prev.filter((item) => item.id !== updated.id);
                return prev.map((item) => (item.id === updated.id ? updated : item));
              });
            }} onDelete={(postId) => setItems((prev) => prev.filter((item) => item.id !== postId))} />
          ))}
        </section>
      )}

      {items.length > 0 ? (
        <div className="flex justify-center">
          <button disabled={loading || !nextCursor} onClick={() => void load(false)} className="ui-btn rounded-full px-5 py-2.5 disabled:opacity-50" type="button">
            {nextCursor ? (loading ? 'Loading…' : 'Load more') : 'No more saved posts'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
