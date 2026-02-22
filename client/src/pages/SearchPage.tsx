import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { searchApi } from '../lib/api';
import type { FeedPost, SearchResults, User } from '../lib/types';
import { PostCard } from '../components/PostCard';

export function SearchPage(props: { currentUser: User | null }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const qParam = searchParams.get('q') ?? '';

  const [q, setQ] = useState(qParam);
  const [data, setData] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setQ(qParam);
  }, [qParam]);

  const canSearch = useMemo(() => qParam.trim().length > 0, [qParam]);

  useEffect(() => {
    if (!canSearch) {
      setData(null);
      return;
    }

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await searchApi.search(qParam.trim(), { limit: 20 });
        setData(res);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed');
        setData(null);
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [canSearch, qParam]);

  const updatePost = (updated: FeedPost) => {
    setData((prev) => {
      if (!prev) return prev;
      return { ...prev, posts: prev.posts.map((p) => (p.id === updated.id ? updated : p)) };
    });
  };

  const deletePost = (postId: number) => {
    setData((prev) => {
      if (!prev) return prev;
      return { ...prev, posts: prev.posts.filter((p) => p.id !== postId) };
    });
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="ui-h1">Search</h1>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const next = q.trim();
          if (!next) {
            setSearchParams({});
            return;
          }
          setSearchParams({ q: next });
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search users and posts"
          className="ui-input"
        />
        <button
          className="ui-btn ui-btn-primary shrink-0 px-3 py-2"
          type="submit"
        >
          Search
        </button>
      </form>

      {loading ? <div className="mt-4 text-sm text-gray-700 dark:text-gray-300">Searching…</div> : null}
      {error ? <div className="ui-error mt-4">{error}</div> : null}

      {data ? (
        <div className="mt-4 grid gap-4">
          <div className="ui-panel ui-panel-soft p-3">
            <div className="text-sm font-semibold">Users</div>
            <div className="mt-2 space-y-2">
              {data.users.length === 0 ? <div className="text-sm text-gray-600 dark:text-gray-400">No users found</div> : null}
              {data.users.map((u) => (
                <Link
                  key={u.id}
                  to={`/u/${encodeURIComponent(u.username)}`}
                  className="ui-row block"
                >
                  <div className="text-sm font-medium">@{u.username}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {u.displayName ? u.displayName : ''}
                    {u.status ? (u.displayName ? ` • ${u.status}` : u.status) : ''}
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div className="ui-panel ui-panel-soft p-3">
            <div className="text-sm font-semibold">Posts</div>
            <div className="mt-3 space-y-3">
              {data.posts.length === 0 ? <div className="text-sm text-gray-600 dark:text-gray-400">No posts found</div> : null}
              {data.posts.map((p) => (
                <PostCard
                  key={p.id}
                  post={p}
                  currentUser={props.currentUser}
                  onChange={updatePost}
                  onDelete={deletePost}
                />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="ui-panel ui-panel-soft mt-4 p-4 text-sm text-gray-700 dark:text-gray-300">
          Type a query and hit Search.
        </div>
      )}
    </div>
  );
}
