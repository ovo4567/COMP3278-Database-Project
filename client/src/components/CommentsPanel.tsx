import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { commentsApi } from '../lib/api';
import type { Comment, User } from '../lib/types';
import { Timestamp } from './Timestamp';

export function CommentsPanel(props: { postId: number; currentUser: User | null }) {
  const [items, setItems] = useState<Comment[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = async (reset: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const res = await commentsApi.list(props.postId, { cursor: reset ? null : nextCursor, limit: 20 });
      setItems((prev) => (reset ? res.items : [...prev, ...res.items]));
      setNextCursor(res.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load comments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.postId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!text.trim()) return;

    try {
      await commentsApi.create(props.postId, { text: text.trim() });
      setText('');
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to comment');
    }
  };

  return (
    <div className="ui-panel ui-panel-soft mt-3 rounded-2xl p-3 sm:p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Conversation</div>
          <div className="ui-muted mt-1 text-xs">Read comments and add your own reply.</div>
        </div>
        <div className="ui-badge ui-system">{items.length} shown</div>
      </div>

      {props.currentUser ? (
        <form onSubmit={submit} className="mt-4 space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Write a comment"
              className="ui-input"
            />
            <button className="ui-btn ui-btn-primary shrink-0 rounded-full px-4 py-2" type="submit">
              Send
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-4 rounded-2xl border border-[rgb(var(--ui-border-rgb)_/_0.65)] bg-white/40 px-4 py-3 text-sm dark:bg-white/5">
          <span className="ui-muted">Login to join the conversation.</span>{' '}
          <Link to="/login" className="ui-link">
            Sign in
          </Link>
        </div>
      )}

      {error ? <div className="ui-error mt-3">{error}</div> : null}

      <div className="mt-4 flex flex-col gap-2">
        {items.length === 0 && !loading ? (
          <div className="rounded-2xl border border-dashed border-[rgb(var(--ui-border-rgb)_/_0.7)] px-4 py-6 text-center text-sm text-gray-600 dark:text-gray-300">
            No comments yet. Be the first to reply.
          </div>
        ) : null}

        {items.map((c, index) => {
          const initials = c.user.displayName?.trim()?.charAt(0) ?? c.user.username.charAt(0);
          return (
            <div key={c.id} className="ui-panel ui-panel-soft ui-card-hover px-3 py-3 ui-appear-up" style={{ animationDelay: `${Math.min(index * 30, 180)}ms` }}>
              <div className="flex gap-3">
                {c.user.avatarUrl ? (
                  <img src={c.user.avatarUrl} alt="Avatar" className="h-10 w-10 rounded-2xl border object-cover" loading="lazy" />
                ) : (
                  <div className="ui-avatar h-10 w-10 rounded-2xl text-xs uppercase">{initials}</div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium text-gray-900 dark:text-gray-100">{c.user.displayName ?? `@${c.user.username}`}</span>
                    <span className="ui-dot" />
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      @{c.user.username} · <Timestamp value={c.createdAt} />
                    </span>
                  </div>
                  <div className="mt-1 whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-100">{c.text}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex justify-end">
        <button disabled={loading || !nextCursor} onClick={() => void load(false)} className="ui-btn rounded-full px-4 py-2 disabled:opacity-50" type="button">
          {nextCursor ? (loading ? 'Loading…' : 'Load older comments') : 'No more comments'}
        </button>
      </div>
    </div>
  );
}
