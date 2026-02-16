import { useState } from 'react';

export function PostComposer(props: {
  onSubmit: (input: { text: string; imageUrl?: string; visibility?: 'public' | 'friends' | 'private' }) => Promise<void>;
}) {
  const [text, setText] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'friends' | 'private'>('public');
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
          className="min-h-24 w-full resize-y rounded-md border px-3 py-2 text-sm dark:border-gray-800 dark:bg-gray-950"
        />
        <input
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="Optional image URL"
          className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-800 dark:bg-gray-950"
        />

        <label className="grid gap-1">
          <div className="text-xs text-gray-600 dark:text-gray-400">Visibility</div>
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as 'public' | 'friends' | 'private')}
            className="w-full rounded-md border bg-white px-3 py-2 text-sm dark:border-gray-800 dark:bg-gray-950"
          >
            <option value="public">Public</option>
            <option value="friends">Friends</option>
            <option value="private">Private</option>
          </select>
        </label>

        <div className="flex items-center justify-between">
          <div className="text-sm text-red-600">{error}</div>
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
