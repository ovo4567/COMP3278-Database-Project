import { useEffect, useState } from 'react';
import { commentsApi } from '../lib/api';
import type { Comment } from '../lib/types';
import { Timestamp } from './Timestamp';

export function CommentsPanel(props: { postId: number }) {
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
    <div className="ui-panel ui-panel-soft mt-2 p-3">
      <form onSubmit={submit} className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write a comment"
          className="ui-input"
        />
        <button className="ui-btn ui-btn-primary shrink-0 px-3 py-2" type="submit">Send</button>
      </form>

      {error ? <div className="ui-error mt-2">{error}</div> : null}

      <div className="mt-3 flex flex-col gap-2">
        {items.map((c) => (
          <div key={c.id} className="ui-panel ui-panel-soft px-3 py-2">
            <div className="ui-muted text-xs">
              @{c.user.username} • <Timestamp value={c.createdAt} />
            </div>
            <div className="text-sm">{c.text}</div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex justify-end">
        <button
          disabled={loading || !nextCursor}
          onClick={() => void load(false)}
          className="ui-link text-sm disabled:opacity-50"
          type="button"
        >
          {nextCursor ? (loading ? 'Loading…' : 'Load older') : 'No more'}
        </button>
      </div>
    </div>
  );
}
