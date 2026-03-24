import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { POST_CATEGORIES, POST_CATEGORY_LABELS, type FeedPost, type PostCategory, type User } from '../lib/types';
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
  const [category, setCategory] = useState<PostCategory>(props.post.category ?? 'all');
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<'like' | 'save' | 'delete' | null>(null);

  const canEdit = useMemo(() => {
    if (!props.currentUser) return false;
    return props.currentUser.username === props.post.user.username || props.currentUser.role === 'admin';
  }, [props.currentUser, props.post.user.username]);

  const displayName = props.post.user.displayName ?? `@${props.post.user.username}`;
  const initials = props.post.user.displayName?.trim()?.charAt(0) ?? props.post.user.username.charAt(0);

  const like = async () => {
    if (!props.currentUser) return;
    setBusyAction('like');
    try {
      const res = await postsApi.toggleLike(props.post.id);
      props.onChange({ ...props.post, likeCount: res.likeCount, likedByMe: res.liked });
    } finally {
      setBusyAction(null);
    }
  };

  const save = async () => {
    setError(null);
    const nextText = text.trim();
    const nextImageUrl = imageUrl.trim();
    if (!nextText && !nextImageUrl) {
      setError('Add text or an image URL');
      return;
    }
    setBusyAction('save');
    try {
      await postsApi.edit(props.post.id, {
        text: nextText,
        imageUrl: nextImageUrl ? nextImageUrl : null,
        visibility,
        category,
      });
      setEditing(false);
      props.onChange({
        ...props.post,
        text: nextText,
        imageUrl: nextImageUrl ? nextImageUrl : null,
        visibility,
        category,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setBusyAction(null);
    }
  };

  const remove = async () => {
    if (!confirm('Delete this post?')) return;
    setBusyAction('delete');
    try {
      await postsApi.remove(props.post.id);
      props.onDelete(props.post.id);
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <article className="group ui-panel ui-panel-soft ui-card-hover relative overflow-hidden rounded-[30px] p-4">
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent" />
      <div className="pointer-events-none absolute -right-10 top-10 h-24 w-24 rounded-full bg-[rgb(var(--ui-accent-rgb)_/_0.12)] blur-3xl" />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex items-start gap-3">
          <Link to={`/u/${encodeURIComponent(props.post.user.username)}`} className="ui-motion rounded-2xl hover:scale-[1.04]">
            {props.post.user.avatarUrl ? (
              <img src={props.post.user.avatarUrl} alt="Avatar" className="h-12 w-12 rounded-2xl border border-white/40 object-cover shadow-[0_16px_30px_-24px_rgb(var(--ui-shadow-rgb)_/_0.45)]" loading="lazy" />
            ) : (
              <div className="ui-avatar h-12 w-12 text-xs uppercase">{initials}</div>
            )}
          </Link>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link to={`/u/${encodeURIComponent(props.post.user.username)}`} className="truncate text-sm font-semibold text-gray-900 hover:underline dark:text-gray-100">
                {displayName}
              </Link>
              <span className="ui-badge ui-system">{POST_CATEGORY_LABELS[props.post.category ?? 'all']}</span>
              {props.post.visibility === 'friends' ? <span className="ui-badge ui-system">Friends only</span> : null}
              {props.post.updatedAt ? <span className="ui-badge">Edited</span> : null}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span>@{props.post.user.username}</span>
              <span className="ui-dot" />
              <Timestamp value={props.post.createdAt} />
              <span className="ui-dot" />
              <Link to={`/p/${props.post.id}`} className="ui-link text-xs">
                Open post
              </Link>
            </div>
          </div>
        </div>

        {canEdit ? (
          <div className="flex shrink-0 flex-wrap gap-2 rounded-full border border-white/20 bg-white/30 px-2 py-1 backdrop-blur-xl dark:bg-white/10">
            <button onClick={() => setEditing((value) => !value)} className="ui-btn rounded-full px-3 py-1.5 text-xs" type="button">
              {editing ? 'Cancel' : 'Edit'}
            </button>
            <button
              onClick={() => void remove()}
              className="ui-btn rounded-full px-3 py-1.5 text-xs"
              disabled={busyAction === 'delete'}
              type="button"
            >
              {busyAction === 'delete' ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        ) : null}
      </div>

      {editing ? (
        <div className="mt-4 space-y-3 rounded-[24px] border border-white/25 bg-white/30 p-3 backdrop-blur-xl dark:bg-white/10">
          <textarea value={text} onChange={(e) => setText(e.target.value)} className="ui-textarea min-h-24" />
          <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="Optional image URL" className="ui-input" />
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Visibility</div>
            <div className="mt-2 ui-segmented">
              <button type="button" onClick={() => setVisibility('public')} className={`ui-segment ${visibility === 'public' ? 'ui-segment-active' : ''}`}>
                Public
              </button>
              <button type="button" onClick={() => setVisibility('friends')} className={`ui-segment ${visibility === 'friends' ? 'ui-segment-active' : ''}`}>
                Friends
              </button>
            </div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Category</div>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as PostCategory)}
              className="ui-input mt-2"
            >
              {POST_CATEGORIES.map((option) => (
                <option key={option} value={option}>
                  {POST_CATEGORY_LABELS[option]}
                </option>
              ))}
            </select>
          </div>
          {error ? <div className="ui-error">{error}</div> : null}
          <div className="flex justify-end">
            <button onClick={() => void save()} className="ui-btn ui-btn-primary rounded-full px-4 py-2" disabled={busyAction === 'save'} type="button">
              {busyAction === 'save' ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      ) : (
        <>
          {props.post.text ? (
            <div className="mt-4 whitespace-pre-wrap rounded-[22px] bg-white/30 px-4 py-3 text-sm leading-6 text-gray-900 shadow-[inset_0_1px_0_rgb(255_255_255_/_0.35)] backdrop-blur-sm dark:bg-white/5 dark:text-gray-100">
              {props.post.text}
            </div>
          ) : null}
          {props.post.imageUrl ? (
            <div className="mt-4 overflow-hidden rounded-[26px] border border-white/25 bg-black/[0.03] shadow-[0_24px_44px_-30px_rgb(var(--ui-shadow-rgb)_/_0.5)] dark:bg-white/[0.03]">
              <img
                src={props.post.imageUrl}
                alt="Post"
                className="max-h-[32rem] w-full cursor-zoom-in object-contain ui-motion group-hover:scale-[1.01]"
                loading="lazy"
                onClick={() => setLightboxOpen(true)}
              />
            </div>
          ) : null}
        </>
      )}

      {lightboxOpen && props.post.imageUrl ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => setLightboxOpen(false)}
        >
          <div className="max-h-full max-w-4xl ui-appear-up" onClick={(e) => e.stopPropagation()}>
            <img
              src={props.post.imageUrl}
              alt="Post"
              className="max-h-[85vh] w-full rounded-2xl border bg-white object-contain dark:border-gray-800 dark:bg-gray-950"
            />
            <div className="mt-3 flex justify-end">
              <button onClick={() => setLightboxOpen(false)} className="ui-btn rounded-full px-4 py-2" type="button">
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[rgb(var(--ui-border-rgb)_/_0.55)] pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => void like()}
            className={`ui-btn rounded-full px-4 py-2 ${props.post.likedByMe ? 'ui-btn-primary' : ''}`}
            disabled={busyAction === 'like' || !props.currentUser}
            type="button"
            title={props.currentUser ? 'Toggle like' : 'Login to like posts'}
          >
            {busyAction === 'like' ? 'Saving…' : props.post.likedByMe ? '♥ Liked' : '♡ Like'}
            <span className="ml-2 ui-system">{props.post.likeCount}</span>
          </button>
          <button onClick={() => setShowComments((value) => !value)} className="ui-btn rounded-full px-4 py-2" type="button">
            {showComments ? 'Hide discussion' : 'View discussion'}
          </button>
        </div>

        {!props.currentUser ? (
          <Link to="/login" className="ui-link text-sm">
            Login to interact
          </Link>
        ) : null}
      </div>

      {showComments ? <CommentsPanel postId={props.post.id} currentUser={props.currentUser} /> : null}
    </article>
  );
}
