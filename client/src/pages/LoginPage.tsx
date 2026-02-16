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
      <h1 className="text-2xl font-semibold">Login</h1>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        No account?{' '}
        <Link className="underline" to="/signup">
          Sign up
        </Link>
      </p>

      <form onSubmit={submit} className="mt-6 space-y-3 rounded-lg border bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        <div>
          <label className="text-sm font-medium">Username</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm dark:border-gray-800 dark:bg-gray-950"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Password</label>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm dark:border-gray-800 dark:bg-gray-950"
          />
        </div>

        {error ? <div className="text-sm text-red-600">{error}</div> : null}

        <button
          disabled={loading}
          className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm text-white transition-colors disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900"
        >
          {loading ? 'Logging in…' : 'Login'}
        </button>
      </form>
    </div>
  );
}
