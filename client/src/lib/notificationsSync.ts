const EVENT_NAME = 'notifications:refresh';

export const requestUnreadRefresh = () => {
  window.dispatchEvent(new Event(EVENT_NAME));
};

export const onUnreadRefreshRequested = (handler: () => void) => {
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
};
