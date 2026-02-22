import { useState } from 'react';

export function PostComposer(props: {
  onSubmit: (input: { text: string; imageUrl?: string; visibility?: 'public' | 'friends' }) => Promise<void>;
}) {
  const [text, setText] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'friends'>('public');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!text.trim()) {
      setError('Text is required');
      return;
    }

    setSaving(true);
    try {
      await props.onSubmit({
        text: text.trim(),
        imageUrl: imageUrl.trim() ? imageUrl.trim() : undefined,
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
    <form onSubmit={submit} className="ui-panel ui-panel-soft p-3">
      <div className="flex flex-col gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What's happening?"
          className="ui-textarea"
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

        <div className="flex items-center justify-end">
          <button
            disabled={saving}
            className="ui-btn ui-btn-primary px-3 py-2 disabled:opacity-50"
          >
            {saving ? 'Posting…' : 'Post'}
          </button>
        </div>
      </div>
    </form>
  );
}
