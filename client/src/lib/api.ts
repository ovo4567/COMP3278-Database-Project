import { config } from './config';
import { tokenStorage } from './storage';
import type {
  AdminAnalytics,
  AdminSqlResult,
  Comment,
  FeedPost,
  ManagedPost,
  NotificationItem,
  PostCategory,
  PostDetail,
  PostStatus,
  SearchResults,
  User,
  UserProfile,
  FriendRequestItem,
  FriendUser,
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

  const doRequest = async (): Promise<Response> =>
    fetch(`${config.apiBase}${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

  const res = await doRequest();
  if (auth && res.status === 401) {
    tokenStorage.clearAccessToken();
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
  }): Promise<{ user: User; accessToken: string }> {
    return apiFetch('/api/auth/signup', { method: 'POST', body: input });
  },

  async login(input: { username: string; password: string }): Promise<{ user: User; accessToken: string }> {
    return apiFetch('/api/auth/login', { method: 'POST', body: input });
  },

  async logout(): Promise<void> {
    await apiFetch('/api/auth/logout', { method: 'POST' });
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
    return apiFetch(`/api/users/${encodeURIComponent(username)}`, { auth: true });
  },
};

export const postsApi = {
  async create(input: {
    text?: string;
    imageUrl?: string;
    visibility?: 'public' | 'friends';
    category?: PostCategory;
    status?: PostStatus;
    scheduledPublishAt?: string | null;
  }): Promise<{ id: number; status: PostStatus }> {
    return apiFetch('/api/posts', { method: 'POST', body: input, auth: true });
  },

  async feed(params: {
    sort: 'new' | 'popular';
    scope?: 'global' | 'friends';
    category?: PostCategory;
    limit?: number;
    cursor?: string | null;
  }): Promise<{ items: FeedPost[]; nextCursor: string | null }> {
    const q = new URLSearchParams();
    q.set('sort', params.sort);
    if (params.scope) q.set('scope', params.scope);
    q.set('category', params.category ?? 'all');
    q.set('limit', String(params.limit ?? 20));
    if (params.cursor) q.set('cursor', params.cursor);
    return apiFetch(`/api/posts/feed?${q.toString()}`, { auth: true });
  },

  async byUser(params: { username: string; limit?: number; cursor?: string | null }): Promise<{ items: Array<Omit<FeedPost, 'user'>>; nextCursor: string | null }> {
    const q = new URLSearchParams();
    q.set('limit', String(params.limit ?? 20));
    if (params.cursor) q.set('cursor', params.cursor);
    return apiFetch(`/api/posts/user/${encodeURIComponent(params.username)}?${q.toString()}`, { auth: true });
  },

  async get(postId: number): Promise<PostDetail> {
    return apiFetch(`/api/posts/${postId}`, { auth: true });
  },

  async getManage(postId: number): Promise<ManagedPost> {
    return apiFetch(`/api/posts/${postId}/manage`, { auth: true });
  },

  async listManaged(): Promise<{ items: ManagedPost[] }> {
    return apiFetch('/api/posts/mine/manage', { auth: true });
  },

  async edit(postId: number, input: {
    text?: string;
    imageUrl?: string | null;
    visibility?: 'public' | 'friends';
    category?: PostCategory;
    status?: PostStatus;
    scheduledPublishAt?: string | null;
  }): Promise<{ ok: true; status: PostStatus }> {
    return apiFetch(`/api/posts/${postId}`, { method: 'PUT', body: input, auth: true });
  },

  async remove(postId: number): Promise<{ ok: true }> {
    return apiFetch(`/api/posts/${postId}`, { method: 'DELETE', auth: true });
  },

  async toggleLike(postId: number): Promise<{ liked: boolean; likeCount: number }> {
    return apiFetch(`/api/posts/${postId}/like`, { method: 'POST', auth: true });
  },

  async toggleCollect(postId: number): Promise<{ collected: boolean; collectCount: number }> {
    return apiFetch(`/api/posts/${postId}/collect`, { method: 'POST', auth: true });
  },

  async collectionsMine(params: { limit?: number; cursor?: number | null } = {}): Promise<{ items: FeedPost[]; nextCursor: number | null }> {
    const q = new URLSearchParams();
    q.set('limit', String(params.limit ?? 30));
    if (params.cursor) q.set('cursor', String(params.cursor));
    return apiFetch(`/api/posts/collections/mine?${q.toString()}`, { auth: true });
  },

};

export const commentsApi = {
  async list(postId: number, params: { limit?: number; cursor?: number | null }): Promise<{ items: Comment[]; nextCursor: number | null }> {
    const q = new URLSearchParams();
    q.set('limit', String(params.limit ?? 20));
    if (params.cursor) q.set('cursor', String(params.cursor));
    return apiFetch(`/api/comments/post/${postId}?${q.toString()}`, { auth: true });
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

  async setUserBanned(userId: string, isBanned: boolean): Promise<{ ok: true }> {
    return apiFetch(`/api/admin/users/${userId}`, { method: 'PATCH', body: { isBanned }, auth: true });
  },

  async deleteUser(userId: string): Promise<{ ok: true }> {
    return apiFetch(`/api/admin/users/${userId}`, { method: 'DELETE', auth: true });
  },

  async getUser(userId: string): Promise<{ id: string; username: string; role: 'user' | 'admin'; isBanned: boolean }> {
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

  async sendRequest(userId: string): Promise<{ ok: true; status: 'pending' | 'accepted' }> {
    return apiFetch(`/api/friends/request/${userId}`, { method: 'POST', auth: true });
  },

  async acceptRequest(userId: string): Promise<{ ok: true }> {
    return apiFetch(`/api/friends/request/${userId}/accept`, { method: 'PUT', auth: true });
  },

  async rejectRequest(userId: string): Promise<{ ok: true }> {
    return apiFetch(`/api/friends/request/${userId}/reject`, { method: 'PUT', auth: true });
  },

  async cancelRequest(userId: string): Promise<{ ok: true }> {
    return apiFetch(`/api/friends/request/${userId}/cancel`, { method: 'DELETE', auth: true });
  },

  async unfriend(userId: string): Promise<{ ok: true }> {
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

  async markReadByActor(input: { actorUsername: string; types?: string[] }): Promise<{ ok: true }> {
    return apiFetch('/api/notifications/read-by-actor', { method: 'POST', body: input, auth: true });
  },
};
