import { useMemo, useState } from 'react';
import type { User } from '../lib/types';

export function PostComposer(props: {
  currentUser?: User | null;
  onSubmit: (input: { text: string; imageUrl?: string; visibility?: 'public' | 'friends' }) => Promise<void>;
}) {
  const [text, setText] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'friends'>('public');
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
      });
      setText('');
      setImageUrl('');
      setVisibility('public');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="ui-hero ui-card-hover">
      <div className="flex items-start gap-4">
        {props.currentUser?.avatarUrl ? (
          <img src={props.currentUser.avatarUrl} alt="Your avatar" className="h-12 w-12 rounded-2xl border object-cover" loading="lazy" />
        ) : (
          <div className="ui-avatar h-12 w-12 text-base uppercase">{initials}</div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="ui-kicker">Create post</div>
              <div className="mt-1 text-base font-semibold text-gray-900 dark:text-gray-100">Share a quick update with your circle</div>
              <div className="ui-muted mt-1 text-sm">Text, image links, and audience control in one place.</div>
            </div>
            <div className="ui-badge ui-system">{trimmedText.length} chars</div>
          </div>

          <div className="mt-4 grid gap-3">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What are you working on, seeing, or thinking about?"
              className="ui-textarea min-h-32"
            />
            <input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="Optional image URL"
              className="ui-input"
            />

            {trimmedImageUrl ? (
              <div className="overflow-hidden rounded-2xl border border-[rgb(var(--ui-border-rgb)_/_0.65)] bg-white/40 p-2 dark:bg-white/5">
                <img
                  src={trimmedImageUrl}
                  alt="Preview"
                  className="max-h-72 w-full rounded-xl object-contain ui-appear-up"
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
