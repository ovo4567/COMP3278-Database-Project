import { useMemo, useState } from 'react';
import { POST_CATEGORIES, POST_CATEGORY_LABELS, type PostCategory, type User } from '../lib/types';

export function PostComposer(props: {
  currentUser?: User | null;
  onSubmit: (input: { text: string; imageUrl?: string; visibility?: 'public' | 'friends'; category?: PostCategory }) => Promise<void>;
}) {
  const [text, setText] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'friends'>('public');
  const [category, setCategory] = useState<PostCategory>('all');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initials = props.currentUser?.displayName?.trim()?.charAt(0) ?? props.currentUser?.username?.charAt(0) ?? 'Y';
  const trimmedText = text.trim();
  const trimmedImageUrl = imageUrl.trim();
  const canSubmit = Boolean(trimmedText || trimmedImageUrl);
  const helperLabel = useMemo(() => {
    if (visibility === 'friends') return 'Only your friends will see this post';
    return 'Anyone browsing the app can discover this post';
  }, [visibility]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!canSubmit) {
      setError('Add text or an image URL');
      return;
    }

    setSaving(true);
    try {
      await props.onSubmit({
        text: trimmedText,
        imageUrl: trimmedImageUrl ? trimmedImageUrl : undefined,
        visibility,
        category,
      });
      setText('');
      setImageUrl('');
      setVisibility('public');
      setCategory('all');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="ui-hero ui-card-hover relative overflow-hidden">
      <div className="pointer-events-none absolute right-0 top-0 h-28 w-28 rounded-full bg-[rgb(var(--ui-accent-rgb)_/_0.16)] blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-10 h-24 w-24 rounded-full bg-[rgb(var(--ui-accent-2-rgb)_/_0.14)] blur-3xl" />

      <div className="relative flex items-start gap-4">
        {props.currentUser?.avatarUrl ? (
          <img src={props.currentUser.avatarUrl} alt="Your avatar" className="h-12 w-12 rounded-2xl border object-cover" loading="lazy" />
        ) : (
          <div className="ui-avatar h-12 w-12 text-base uppercase">{initials}</div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="ui-kicker">Create post</div>
              <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">Drop something fresh into the room</div>
              <div className="ui-muted mt-1 text-sm">A glassy composer for quick thoughts, photo links, and audience control.</div>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-white/30 bg-white/40 px-3 py-2 text-xs shadow-[0_16px_30px_-24px_rgb(var(--ui-shadow-rgb)_/_0.45)] backdrop-blur-xl dark:bg-white/10">
              <span className="h-2 w-2 rounded-full bg-[rgb(var(--ui-accent-rgb))] shadow-[0_0_12px_rgb(var(--ui-accent-rgb)_/_0.65)]" />
              <span className="ui-system">{trimmedText.length} chars</span>
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What are you working on, seeing, or thinking about?"
              className="ui-textarea min-h-36 shadow-[0_24px_44px_-34px_rgb(var(--ui-shadow-rgb)_/_0.42)]"
            />
            <input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="Drop an image URL to make the card pop"
              className="ui-input"
            />

            {trimmedImageUrl ? (
              <div className="overflow-hidden rounded-[24px] border border-white/25 bg-white/35 p-2 shadow-[0_20px_44px_-30px_rgb(var(--ui-shadow-rgb)_/_0.48)] backdrop-blur-xl dark:bg-white/10">
                <img
                  src={trimmedImageUrl}
                  alt="Preview"
                  className="max-h-72 w-full rounded-[18px] object-contain ui-appear-up"
                  loading="lazy"
                />
              </div>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-xs font-medium uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Audience</div>
                <div className="mt-2 ui-segmented">
                  <button
                    type="button"
                    onClick={() => setVisibility('public')}
                    className={`ui-segment ${visibility === 'public' ? 'ui-segment-active' : ''}`}
                  >
                    Public
                  </button>
                  <button
                    type="button"
                    onClick={() => setVisibility('friends')}
                    className={`ui-segment ${visibility === 'friends' ? 'ui-segment-active' : ''}`}
                  >
                    Friends
                  </button>
                </div>
                <div className="ui-muted mt-2 text-xs">{helperLabel}</div>
              </div>

              <div>
                <div className="text-xs font-medium uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Category</div>
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value as PostCategory)}
                  className="ui-input mt-2 min-w-56"
                >
                  {POST_CATEGORIES.map((option) => (
                    <option key={option} value={option}>
                      {POST_CATEGORY_LABELS[option]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 self-end">
                <button
                  type="submit"
                  disabled={saving || !canSubmit}
                  className="ui-btn ui-btn-primary rounded-full px-5 py-2.5 disabled:opacity-50"
                >
                  {saving ? 'Posting…' : 'Publish post'}
                </button>
              </div>
            </div>
          </div>

          {error ? <div className="ui-error mt-4">{error}</div> : null}
        </div>
      </div>
    </form>
  );
}
