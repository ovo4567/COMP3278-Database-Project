import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { PostDetail, User } from '../lib/types';
import { notificationsApi, postsApi } from '../lib/api';
import { PostCard } from '../components/PostCard';
import { requestUnreadRefresh } from '../lib/notificationsSync';

export function PostPage(props: { currentUser: User | null }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const postId = Number(id);

  const [post, setPost] = useState<PostDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isFinite(postId)) return;

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const p = await postsApi.get(postId);
        setPost(p);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load post');
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [postId]);

  useEffect(() => {
    if (!props.currentUser) return;
    if (!Number.isFinite(postId)) return;
    void (async () => {
      try {
        await notificationsApi.markReadByEntity({ entityType: 'post', entityId: postId });
        requestUnreadRefresh();
      } catch {
        // Non-fatal
      }
    })();
  }, [postId, props.currentUser?.id]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Post</h1>
        <Link to="/" className="text-sm underline">
          Back to feed
        </Link>
      </div>

      {loading ? <div className="mt-4 text-sm text-gray-700 dark:text-gray-300">Loading…</div> : null}
      {error ? <div className="mt-4 text-sm text-red-600">{error}</div> : null}

      {post ? (
        <div className="mt-4">
          <PostCard
            post={post}
            currentUser={props.currentUser}
            onChange={(p) => setPost(p as PostDetail)}
            onDelete={() => navigate('/')}
          />
        </div>
      ) : null}
    </div>
  );
}
