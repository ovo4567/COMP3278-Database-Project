import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { postsApi } from '../lib/api';
import { POST_CATEGORIES, POST_CATEGORY_LABELS, type ManagedPost, type PostCategory, type PostStatus, type User } from '../lib/types';
import { fileToLocalImageDataUrl } from '../lib/localImage';
import { Timestamp } from '../components/Timestamp';

export function PostEditorPage(props: { currentUser: User | null }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const editingId = id ? Number(id) : null;

  const [text, setText] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imageFileName, setImageFileName] = useState<string | null>(null);
  const [imageProcessing, setImageProcessing] = useState(false);
  const [visibility, setVisibility] = useState<'public' | 'friends'>('public');
  const [category, setCategory] = useState<PostCategory>('all');
  const [status, setStatus] = useState<PostStatus>('published');
  const [scheduledPublishAt, setScheduledPublishAt] = useState('');
  const [managedPosts, setManagedPosts] = useState<ManagedPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!props.currentUser) return;
    void (async () => {
      try {
        const res = await postsApi.listManaged();
        setManagedPosts(res.items);
      } catch {
        // Non-fatal for the editor shell.
      }
    })();
  }, [props.currentUser?.id]);

  useEffect(() => {
    if (!props.currentUser || !editingId || !Number.isFinite(editingId)) return;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const post = await postsApi.getManage(editingId);
        setText(post.text);
        setImageUrl(post.imageUrl ?? '');
        setImageFileName(null);
        setVisibility(post.visibility ?? 'public');
        setCategory(post.category);
        setStatus(post.status);
        setScheduledPublishAt(post.scheduledPublishAt ? post.scheduledPublishAt.slice(0, 16) : '');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load post');
      } finally {
        setLoading(false);
      }
    })();
  }, [editingId, props.currentUser?.id]);

  if (!props.currentUser) return <Navigate to="/login" />;

  const submit = async (nextStatus: PostStatus) => {
    setError(null);
    if (nextStatus === 'scheduled') {
      if (!scheduledPublishAt) {
        setError('Scheduled posts require a publish time');
        return;
      }
      const scheduledAtMs = Date.parse(scheduledPublishAt);
      if (Number.isNaN(scheduledAtMs)) {
        setError('Scheduled posts require a valid publish time');
        return;
      }
      if (scheduledAtMs <= Date.now()) {
        setError('Scheduled posts must be set in the future');
        return;
      }
    }

    const nextScheduledPublishAt = nextStatus === 'scheduled' && scheduledPublishAt ? new Date(scheduledPublishAt).toISOString() : null;
    setSaving(true);
    try {
      const payload = {
        text: text.trim(),
        imageUrl: imageUrl.trim() ? imageUrl.trim() : undefined,
        visibility,
        category,
        status: nextStatus,
        scheduledPublishAt: nextScheduledPublishAt,
      };

      if (editingId) {
        await postsApi.edit(editingId, payload);
        navigate(`/p/${editingId}`);
      } else {
        const result = await postsApi.create(payload);
        navigate(`/p/${result.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save post');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ui-shell-narrow space-y-5">
      <section className="ui-hero">
        <div className="ui-kicker">{editingId ? 'Edit post' : 'Create post'}</div>
        <h1 className="ui-h1 mt-3">{editingId ? 'Refine visibility, timing, and draft state.' : 'Write now, schedule later, or save as a draft.'}</h1>
        <p className="ui-muted mt-2 max-w-2xl text-sm">
          This editor keeps post status, visibility, and scheduled publishing in one place so you do not have to hop between screens.
        </p>
      </section>

      <section className="ui-panel ui-panel-soft rounded-[28px] p-5">
        {loading ? <div className="ui-muted text-sm">Loading editor…</div> : null}
        <div className="grid gap-4">
          <textarea value={text} onChange={(event) => setText(event.target.value)} className="ui-textarea min-h-40" placeholder="Write your post" />
          <input
            value={imageUrl}
            onChange={(event) => {
              setImageUrl(event.target.value);
              setImageFileName(null);
            }}
            className="ui-input"
            placeholder="Optional image URL or local image"
          />
          <div className="flex flex-wrap items-center gap-3">
            <label className="ui-btn rounded-full px-4 py-2 cursor-pointer">
              {imageProcessing ? 'Processing…' : 'Choose local image'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={imageProcessing || saving}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setImageProcessing(true);
                  setError(null);
                  try {
                    const nextImage = await fileToLocalImageDataUrl(file, {
                      maxDimension: 1600,
                      maxFileBytes: 12 * 1024 * 1024,
                      outputType: 'image/jpeg',
                      quality: 0.85,
                      fileTooLargeMessage: 'Please choose an image smaller than 12MB',
                    });
                    setImageUrl(nextImage);
                    setImageFileName(file.name);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Failed to process image');
                  } finally {
                    setImageProcessing(false);
                    e.target.value = '';
                  }
                }}
              />
            </label>
            <button
              type="button"
              className="ui-btn rounded-full px-4 py-2"
              onClick={() => {
                setImageUrl('');
                setImageFileName(null);
              }}
            >
              Clear image
            </button>
            <div className="ui-muted text-xs">
              {imageFileName ? `Selected file: ${imageFileName}` : 'Local images are compressed before saving.'}
            </div>
          </div>
          {imageUrl ? (
            <div className="overflow-hidden rounded-[24px] border border-white/25 bg-white/35 p-2 shadow-[0_20px_44px_-30px_rgb(var(--ui-shadow-rgb)_/_0.48)] backdrop-blur-xl dark:bg-white/10">
              <img src={imageUrl} alt="Post preview" className="max-h-80 w-full rounded-[18px] object-contain" />
            </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-3">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Visibility group</div>
              <div className="mt-2 ui-segmented">
                <button type="button" className={`ui-segment ${visibility === 'public' ? 'ui-segment-active' : ''}`} onClick={() => setVisibility('public')}>
                  Public
                </button>
                <button type="button" className={`ui-segment ${visibility === 'friends' ? 'ui-segment-active' : ''}`} onClick={() => setVisibility('friends')}>
                  Friends
                </button>
              </div>
            </div>

            <div>
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Category</div>
              <select value={category} onChange={(event) => setCategory(event.target.value as PostCategory)} className="ui-input mt-2">
                {POST_CATEGORIES.map((option) => (
                  <option key={option} value={option}>
                    {POST_CATEGORY_LABELS[option]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Post status</div>
              <div className="mt-2 ui-segmented">
                <button type="button" className={`ui-segment ${status === 'draft' ? 'ui-segment-active' : ''}`} onClick={() => setStatus('draft')}>
                  Draft
                </button>
                <button type="button" className={`ui-segment ${status === 'scheduled' ? 'ui-segment-active' : ''}`} onClick={() => setStatus('scheduled')}>
                  Scheduled
                </button>
                <button type="button" className={`ui-segment ${status === 'published' ? 'ui-segment-active' : ''}`} onClick={() => setStatus('published')}>
                  Publish
                </button>
              </div>
            </div>
          </div>

          {status === 'scheduled' ? (
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Scheduled publish time</div>
              <input type="datetime-local" value={scheduledPublishAt} onChange={(event) => setScheduledPublishAt(event.target.value)} className="ui-input mt-2 max-w-sm" />
            </div>
          ) : null}

          {error ? <div className="ui-error">{error}</div> : null}

          <div className="flex flex-wrap gap-2">
            <button type="button" className="ui-btn rounded-full px-4 py-2" disabled={saving || imageProcessing} onClick={() => void submit('draft')}>
              Save draft
            </button>
            <button type="button" className="ui-btn rounded-full px-4 py-2" disabled={saving || imageProcessing} onClick={() => void submit('scheduled')}>
              Schedule post
            </button>
            <button type="button" className="ui-btn ui-btn-primary rounded-full px-4 py-2" disabled={saving || imageProcessing} onClick={() => void submit('published')}>
              {saving ? 'Saving…' : 'Publish now'}
            </button>
          </div>
        </div>
      </section>

      <section className="ui-panel ui-panel-soft rounded-[28px] p-5">
        <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Your drafts and scheduled posts</div>
        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">Quickly reopen unfinished work and queued publishes.</div>
        <div className="mt-4 grid gap-3">
          {managedPosts.filter((post) => post.status !== 'published').length === 0 ? (
            <div className="ui-muted text-sm">No drafts or scheduled posts yet.</div>
          ) : (
            managedPosts
              .filter((post) => post.status !== 'published')
              .map((post) => (
                <Link key={post.id} to={`/compose/${post.id}`} className="rounded-[22px] border border-white/25 bg-white/30 px-4 py-3 text-sm backdrop-blur-xl dark:bg-white/5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-gray-900 dark:text-gray-100">Post #{post.id}</span>
                    <span className="ui-badge">{post.status}</span>
                  </div>
                  <div className="mt-2 line-clamp-2 text-gray-700 dark:text-gray-300">
                    {post.text.trim() || 'Empty draft'}
                  </div>
                  <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    {post.status === 'scheduled' && post.scheduledPublishAt ? (
                      <>
                        Scheduled for <Timestamp value={post.scheduledPublishAt} />
                      </>
                    ) : (
                      <>
                        Updated <Timestamp value={post.updatedAt ?? post.createdAt} />
                      </>
                    )}
                  </div>
                </Link>
              ))
          )}
        </div>
      </section>
    </div>
  );
}
