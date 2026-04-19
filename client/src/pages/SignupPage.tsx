import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi } from '../lib/api';
import { tokenStorage } from '../lib/storage';
import type { User } from '../lib/types';

export function SignupPage(props: { onLogin: (user: User) => void }) {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await authApi.signup({
        username: username.trim().toLowerCase(),
        password,
        displayName: displayName.trim() ? displayName.trim() : undefined,
        bio: bio.trim() ? bio.trim() : undefined,
        avatarUrl: avatarUrl.trim() ? avatarUrl.trim() : undefined,
      });
      tokenStorage.setAccessToken(res.accessToken);
      props.onLogin(res.user);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign up failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <h1 className="ui-h1">Create account</h1>
      <p className="ui-muted mt-1 text-sm">
        Already have an account?{' '}
        <Link className="ui-link" to="/login">
          Login
        </Link>
      </p>

      <form onSubmit={submit} className="ui-panel ui-panel-soft mt-6 space-y-3 p-4">
        <div>
          <label className="text-sm font-medium">Username</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="ui-input mt-1"
            autoComplete="username"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Password</label>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            className="ui-input mt-1"
            autoComplete="new-password"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Display name (optional)</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="ui-input mt-1"
            autoComplete="name"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Bio (optional)</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className="ui-textarea mt-1 min-h-20"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Profile picture URL (optional)</label>
          <input
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            className="ui-input mt-1"
          />
        </div>

        {error ? <div className="ui-error">{error}</div> : null}

        <button
          disabled={loading}
          className="ui-btn ui-btn-primary w-full px-3 py-2 disabled:opacity-50"
        >
          {loading ? 'Creating…' : 'Sign up'}
        </button>
      </form>
    </div>
  );
}
