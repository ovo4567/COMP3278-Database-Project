import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi } from '../lib/api';
import { tokenStorage } from '../lib/storage';
import type { User } from '../lib/types';

export function LoginPage(props: { onLogin: (user: User) => void }) {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await authApi.login({ username: username.trim(), password });
      tokenStorage.setAccessToken(res.accessToken);
      tokenStorage.setRefreshToken(res.refreshToken);
      props.onLogin(res.user);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <h1 className="ui-h1">Welcome back</h1>
      <p className="ui-muted mt-1 text-sm">
        No account?{' '}
        <Link className="ui-link" to="/signup">
          Sign up
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
            autoComplete="current-password"
          />
        </div>

        {error ? <div className="ui-error">{error}</div> : null}

        <button
          disabled={loading}
          className="ui-btn ui-btn-primary w-full px-3 py-2 disabled:opacity-50"
        >
          {loading ? 'Logging in…' : 'Login'}
        </button>
      </form>
    </div>
  );
}
