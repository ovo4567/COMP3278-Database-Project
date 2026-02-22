import { config } from './config';
import { tokenStorage } from './storage';
import type {
  AdminAnalytics,
  AdminSqlResult,
  Comment,
  FeedPost,
  PostDetail,
  User,
  UserProfile,
  SearchResults,
  FriendRequestItem,
  FriendUser,
  NotificationItem,
} from './types';

type ApiError = { error: string };

const asJson = async <T>(res: Response): Promise<T> => {
  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const message = (data as ApiError | null)?.error ?? `HTTP ${res.status}`;
    throw new Error(message);
  }
  return data as T;
};

const refreshAccessToken = async (): Promise<string | null> => {
  const refreshToken = tokenStorage.getRefreshToken();
  if (!refreshToken) return null;

  const res = await fetch(`${config.apiBase}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!res.ok) return null;
  const data = (await res.json()) as { accessToken: string };
  tokenStorage.setAccessToken(data.accessToken);
  return data.accessToken;
};

export const apiFetch = async <T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> => {
  const method = options.method ?? 'GET';
  const auth = options.auth ?? false;

  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (auth) {
    const token = tokenStorage.getAccessToken();
    if (token) headers.authorization = `Bearer ${token}`;
  }

  const doRequest = async (): Promise<Response> => {
    return fetch(`${config.apiBase}${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  };

  let res = await doRequest();
  if (res.status === 401 && auth && tokenStorage.getRefreshToken()) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers.authorization = `Bearer ${newToken}`;
      res = await doRequest();
    }
  }

  return asJson<T>(res);
};

export const authApi = {
  async signup(input: {
    username: string;
    password: string;
    displayName?: string;
    status?: string;
    bio?: string;
    avatarUrl?: string;
  }): Promise<{ user: User; accessToken: string; refreshToken: string }> {
    return apiFetch('/api/auth/signup', { method: 'POST', body: input });
  },

  async login(input: { username: string; password: string }): Promise<{ user: User; accessToken: string; refreshToken: string }> {
    return apiFetch('/api/auth/login', { method: 'POST', body: input });
  },

  async logout(): Promise<void> {
    const refreshToken = tokenStorage.getRefreshToken();
    if (refreshToken) {
      await apiFetch('/api/auth/logout', { method: 'POST', body: { refreshToken } });
    }
  },

  async me(): Promise<User> {
    return apiFetch('/api/me', { auth: true });
  },

  async updateMe(input: {
    displayName?: string;
    status?: string;
    bio?: string;
    avatarUrl?: string;
  }): Promise<UserProfile> {
    return apiFetch('/api/me', { method: 'PATCH', body: input, auth: true });
  },
};

export const usersApi = {
  async getProfile(username: string): Promise<UserProfile> {
    // Use auth when available so `optionalAuth` can include `friendship` status.
    return apiFetch(`/api/users/${encodeURIComponent(username)}`, { auth: true });
  },
};

export const postsApi = {
  async create(input: { text: string; imageUrl?: string; visibility?: 'public' | 'friends' }): Promise<{ id: number }> {
    return apiFetch('/api/posts', { method: 'POST', body: input, auth: true });
  },

  async feed(params: { sort: 'new' | 'popular'; scope?: 'global' | 'friends'; limit?: number; cursor?: string | null }): Promise<{ items: FeedPost[]; nextCursor: string | null }> {
    const q = new URLSearchParams();
    q.set('sort', params.sort);
    if (params.scope) q.set('scope', params.scope);
    q.set('limit', String(params.limit ?? 20));
    if (params.cursor) q.set('cursor', params.cursor);
    return apiFetch(`/api/posts/feed?${q.toString()}`, { auth: true });
  },

  async byUser(params: { username: string; limit?: number; cursor?: string | null }): Promise<{ items: Array<Omit<FeedPost, 'user'>>; nextCursor: string | null }> {
    const q = new URLSearchParams();
    q.set('limit', String(params.limit ?? 20));
    if (params.cursor) q.set('cursor', params.cursor);
    return apiFetch(`/api/posts/user/${encodeURIComponent(params.username)}?${q.toString()}`);
  },

  async get(postId: number): Promise<PostDetail> {
    return apiFetch(`/api/posts/${postId}`);
  },

  async edit(postId: number, input: { text?: string; imageUrl?: string | null; visibility?: 'public' | 'friends' }): Promise<{ ok: true }> {
    return apiFetch(`/api/posts/${postId}`, { method: 'PUT', body: input, auth: true });
  },

  async remove(postId: number): Promise<{ ok: true }> {
    return apiFetch(`/api/posts/${postId}`, { method: 'DELETE', auth: true });
  },

  async toggleLike(postId: number): Promise<{ liked: boolean; likeCount: number }> {
    return apiFetch(`/api/posts/${postId}/like`, { method: 'POST', auth: true });
  },
};

export const commentsApi = {
  async list(postId: number, params: { limit?: number; cursor?: number | null }): Promise<{ items: Comment[]; nextCursor: number | null }> {
    const q = new URLSearchParams();
    q.set('limit', String(params.limit ?? 20));
    if (params.cursor) q.set('cursor', String(params.cursor));
    return apiFetch(`/api/comments/post/${postId}?${q.toString()}`);
  },

  async create(postId: number, input: { text: string }): Promise<{ id: number }> {
    return apiFetch(`/api/comments/post/${postId}`, { method: 'POST', body: input, auth: true });
  },
};

export const adminApi = {
  async analytics(params: { days?: number } = {}): Promise<AdminAnalytics> {
    const q = new URLSearchParams();
    if (params.days) q.set('days', String(params.days));
    const suffix = q.toString() ? `?${q.toString()}` : '';
    return apiFetch(`/api/admin/analytics${suffix}`, { auth: true });
  },

  async runSql(input: { query: string }): Promise<AdminSqlResult> {
    return apiFetch('/api/admin/sql', { method: 'POST', body: input, auth: true });
  },

  async setUserBanned(userId: number, isBanned: boolean): Promise<{ ok: true }> {
    return apiFetch(`/api/admin/users/${userId}`, { method: 'PATCH', body: { isBanned }, auth: true });
  },

  async deleteUser(userId: number): Promise<{ ok: true }> {
    return apiFetch(`/api/admin/users/${userId}`, { method: 'DELETE', auth: true });
  },

  async getUser(userId: number): Promise<{ id: number; username: string; role: 'user' | 'admin'; isBanned: boolean }> {
    return apiFetch(`/api/admin/users/${userId}`, { auth: true });
  },
};

export const searchApi = {
  async search(q: string, params: { limit?: number } = {}): Promise<SearchResults> {
    const sp = new URLSearchParams();
    sp.set('q', q);
    if (params.limit) sp.set('limit', String(params.limit));
    return apiFetch(`/api/search?${sp.toString()}`, { auth: true });
  },
};

export const friendsApi = {
  async listMine(params: { limit?: number; cursor?: number | null } = {}): Promise<{ items: Array<FriendUser & { friendedAt: string }>; nextCursor: number | null }> {
    const q = new URLSearchParams();
    q.set('limit', String(params.limit ?? 30));
    if (params.cursor) q.set('cursor', String(params.cursor));
    return apiFetch(`/api/friends?${q.toString()}`, { auth: true });
  },

  async listRequestsReceived(params: { limit?: number; cursor?: number | null } = {}): Promise<{ items: FriendRequestItem[]; nextCursor: number | null }> {
    const q = new URLSearchParams();
    q.set('limit', String(params.limit ?? 30));
    if (params.cursor) q.set('cursor', String(params.cursor));
    return apiFetch(`/api/friends/requests?${q.toString()}`, { auth: true });
  },

  async listRequestsSent(params: { limit?: number; cursor?: number | null } = {}): Promise<{ items: FriendRequestItem[]; nextCursor: number | null }> {
    const q = new URLSearchParams();
    q.set('limit', String(params.limit ?? 30));
    if (params.cursor) q.set('cursor', String(params.cursor));
    return apiFetch(`/api/friends/requests/sent?${q.toString()}`, { auth: true });
  },

  async sendRequest(userId: number): Promise<{ ok: true; status: 'pending' | 'accepted' }> {
    return apiFetch(`/api/friends/request/${userId}`, { method: 'POST', auth: true });
  },

  async acceptRequest(userId: number): Promise<{ ok: true }> {
    return apiFetch(`/api/friends/request/${userId}/accept`, { method: 'PUT', auth: true });
  },

  async rejectRequest(userId: number): Promise<{ ok: true }> {
    return apiFetch(`/api/friends/request/${userId}/reject`, { method: 'PUT', auth: true });
  },

  async cancelRequest(userId: number): Promise<{ ok: true }> {
    return apiFetch(`/api/friends/request/${userId}/cancel`, { method: 'DELETE', auth: true });
  },

  async unfriend(userId: number): Promise<{ ok: true }> {
    return apiFetch(`/api/friends/${userId}`, { method: 'DELETE', auth: true });
  },
};

export const notificationsApi = {
  async list(params: { limit?: number; cursor?: number | null } = {}): Promise<{ items: NotificationItem[]; nextCursor: number | null }> {
    const q = new URLSearchParams();
    q.set('limit', String(params.limit ?? 30));
    if (params.cursor) q.set('cursor', String(params.cursor));
    return apiFetch(`/api/notifications?${q.toString()}`, { auth: true });
  },

  async unreadCount(): Promise<{ count: number }> {
    return apiFetch('/api/notifications/unread-count', { auth: true });
  },

  async markRead(ids: number[]): Promise<{ ok: true }> {
    return apiFetch('/api/notifications/read', { method: 'POST', body: { ids }, auth: true });
  },

  async markReadAll(): Promise<{ ok: true }> {
    return apiFetch('/api/notifications/read-all', { method: 'POST', auth: true });
  },

  async markReadByEntity(input: { entityType: string; entityId: number; types?: string[] }): Promise<{ ok: true }> {
    return apiFetch('/api/notifications/read-by-entity', { method: 'POST', body: input, auth: true });
  },
};
