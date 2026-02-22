import { useMemo, useState } from 'react';
import type { FeedPost, User } from '../lib/types';
import { postsApi } from '../lib/api';
import { CommentsPanel } from './CommentsPanel';
import { Timestamp } from './Timestamp';

export function PostCard(props: {
  post: FeedPost;
  currentUser: User | null;
  onChange: (post: FeedPost) => void;
  onDelete: (postId: number) => void;
}) {
  const [showComments, setShowComments] = useState(false);
  const [editing, setEditing] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [text, setText] = useState(props.post.text);
  const [imageUrl, setImageUrl] = useState(props.post.imageUrl ?? '');
  const [visibility, setVisibility] = useState<'public' | 'friends'>(props.post.visibility ?? 'public');
  const [error, setError] = useState<string | null>(null);

  const canEdit = useMemo(() => {
    if (!props.currentUser) return false;
    return props.currentUser.username === props.post.user.username || props.currentUser.role === 'admin';
  }, [props.currentUser, props.post.user.username]);

  const like = async () => {
    const res = await postsApi.toggleLike(props.post.id);
    props.onChange({ ...props.post, likeCount: res.likeCount, likedByMe: res.liked });
  };

  const save = async () => {
    setError(null);
    try {
      await postsApi.edit(props.post.id, {
        text: text.trim(),
        imageUrl: imageUrl.trim() ? imageUrl.trim() : null,
        visibility,
      });
      setEditing(false);
      props.onChange({
        ...props.post,
        text: text.trim(),
        imageUrl: imageUrl.trim() ? imageUrl.trim() : null,
        visibility,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    }
  };

  const remove = async () => {
    await postsApi.remove(props.post.id);
    props.onDelete(props.post.id);
  };

  return (
    <article className="ui-panel ui-panel-soft p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {props.post.user.displayName ?? `@${props.post.user.username}`}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            @{props.post.user.username} • <Timestamp value={props.post.createdAt} />
            {props.post.updatedAt ? ' (edited)' : ''}
          </div>
        </div>

        {canEdit ? (
          <div className="flex gap-2">
            <button
              onClick={() => setEditing((v) => !v)}
              className="ui-btn px-2 py-1 text-xs"
            >
              {editing ? 'Cancel' : 'Edit'}
            </button>
            <button
              onClick={() => void remove()}
              className="ui-btn px-2 py-1 text-xs"
            >
              Delete
            </button>
          </div>
        ) : null}
      </div>

      {editing ? (
        <div className="mt-2 space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="ui-textarea min-h-20"
          />
          <input
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="Optional image URL"
            className="ui-input"
          />
          <label className="grid gap-1">
            <div className="text-xs text-gray-600 dark:text-gray-400">Visibility</div>
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as 'public' | 'friends')}
              className="ui-select"
            >
              <option value="public">Public</option>
              <option value="friends">Friends</option>
            </select>
          </label>
          {error ? <div className="ui-error">{error}</div> : null}
          <div className="flex justify-end">
            <button
              onClick={() => void save()}
              className="ui-btn ui-btn-primary px-3 py-2"
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {props.post.visibility === 'friends' ? (
              <span className="ui-badge ui-system">Friends</span>
            ) : null}
          </div>
          <div className="mt-2 whitespace-pre-wrap text-sm text-gray-900 dark:text-gray-100">{props.post.text}</div>
          {props.post.imageUrl ? (
            <div className="mt-2">
              <img
                src={props.post.imageUrl}
                alt="Post"
                className="max-h-96 w-full cursor-zoom-in rounded-md border object-contain"
                loading="lazy"
                onClick={() => setLightboxOpen(true)}
              />
            </div>
          ) : null}
        </>
      )}

      {lightboxOpen && props.post.imageUrl ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
          role="dialog"
          aria-modal="true"
          onClick={() => setLightboxOpen(false)}
        >
          <div className="max-h-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
            <img
              src={props.post.imageUrl}
              alt="Post"
              className="max-h-[85vh] w-full rounded-md border bg-white object-contain dark:border-gray-800 dark:bg-gray-950"
            />
            <div className="mt-2 flex justify-end">
              <button
                onClick={() => setLightboxOpen(false)}
                className="ui-btn"
                type="button"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex items-center justify-between">
        <button
          onClick={() => void like()}
          className="ui-btn"
        >
          {props.post.likedByMe ? 'Unlike' : 'Like'} • {props.post.likeCount}
        </button>
        <button
          onClick={() => setShowComments((v) => !v)}
          className="ui-link text-sm"
        >
          {showComments ? 'Hide comments' : 'Comments'}
        </button>
      </div>

      {showComments ? <CommentsPanel postId={props.post.id} /> : null}
    </article>
  );
}
