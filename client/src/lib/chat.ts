import { getSocket } from './realtime';

export type ChatMessage = {
  id: number;
  groupId: number;
  type: 'text' | 'image';
  text: string | null;
  imageUrl: string | null;
  createdAt: string;
  user: { id: number; username: string; displayName: string | null; avatarUrl: string | null };
};

export type ChatEvent = { type: 'chat_message'; message: ChatMessage };

export const chatSocket = {
  async join(groupId: number): Promise<void> {
    const s = getSocket();
    await new Promise<void>((resolve, reject) => {
      s.emit('chat:join', groupId, (res: { ok: true } | { ok: false; error: string }) => {
        if (res.ok) resolve();
        else reject(new Error(res.error));
      });
    });
  },

  async leave(groupId: number): Promise<void> {
    const s = getSocket();
    await new Promise<void>((resolve) => {
      s.emit('chat:leave', groupId, () => resolve());
    });
  },

  async send(input: { groupId: number; type: 'text' | 'image'; text?: string; imageUrl?: string }): Promise<number> {
    const s = getSocket();
    return new Promise<number>((resolve, reject) => {
      s.emit('chat:send', input, (res: { ok: true; id: number } | { ok: false; error: string }) => {
        if (res.ok) resolve(res.id);
        else reject(new Error(res.error));
      });
    });
  },

  onEvent(handler: (event: ChatEvent) => void) {
    const s = getSocket();
    const listener = (event: ChatEvent) => handler(event);
    s.on('chat:event', listener);
    return () => {
      s.off('chat:event', listener);
    };
  },
};
