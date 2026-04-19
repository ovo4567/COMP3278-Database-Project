const ACCESS_TOKEN_KEY = 'accessToken';

export const AUTH_TOKEN_CHANGED_EVENT = 'auth:token-changed';

const emitTokenChanged = () => {
  // Some environments (tests/SSR) may not have window.
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(AUTH_TOKEN_CHANGED_EVENT));
};

export const tokenStorage = {
  getAccessToken(): string | null {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  },
  setAccessToken(token: string) {
    localStorage.setItem(ACCESS_TOKEN_KEY, token);
    emitTokenChanged();
  },
  clearAccessToken() {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    emitTokenChanged();
  },
  clearAll() {
    this.clearAccessToken();
  },
};
