import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { chatApi, friendsApi, notificationsApi, usersApi } from '../lib/api';
import type { ChatGroup, ChatInvite, ChatMember, ChatMessage, FriendUser, User } from '../lib/types';
import { chatSocket } from '../lib/chat';
import { requestUnreadRefresh } from '../lib/notificationsSync';
import { getSocket } from '../lib/realtime';
import { Timestamp } from '../components/Timestamp';

function MessageView(props: { msg: ChatMessage; currentUser: User }) {
  const isMe = props.msg.user.id === props.currentUser.id;

  return (
    <div className="flex w-full">
      <div
        className={`max-w-[80%] rounded-lg border px-3 py-2 ${isMe ? 'ml-auto text-white' : 'mr-auto text-gray-900 dark:text-gray-100'}`}
        style={
          isMe
            ? {
                backgroundColor: 'rgb(var(--ui-accent-rgb) / 0.95)',
                borderColor: 'rgb(var(--ui-accent-rgb) / 0.55)',
              }
            : {
                backgroundColor: 'rgb(var(--ui-surface-2-rgb) / 0.62)',
                borderColor: 'rgb(var(--ui-border-rgb) / 0.6)',
              }
        }
      >
        <div
          className={`text-xs ${isMe ? 'text-right text-white/80' : 'text-left text-gray-500 dark:text-gray-400'}`}
        >
          @{props.msg.user.username} • <Timestamp value={props.msg.createdAt} />
        </div>
        {props.msg.type === 'image' && props.msg.imageUrl ? (
          <img
            src={props.msg.imageUrl}
            alt="chat"
            className="mt-2 max-h-80 w-full rounded-md border object-contain dark:border-gray-800"
          />
        ) : null}
        {props.msg.text ? <div className="mt-1 whitespace-pre-wrap text-sm">{props.msg.text}</div> : null}
      </div>
    </div>
  );
}

export function ChatPage(props: { currentUser: User | null }) {
  const user = props.currentUser;
  const [searchParams, setSearchParams] = useSearchParams();
  const [myGroups, setMyGroups] = useState<ChatGroup[]>([]);
  const [publicGroups, setPublicGroups] = useState<ChatGroup[]>([]);
  const [invites, setInvites] = useState<ChatInvite[]>([]);

  const [selectedGroup, setSelectedGroup] = useState<ChatGroup | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const [members, setMembers] = useState<ChatMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [showMembers, setShowMembers] = useState(false);

  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupPrivate, setNewGroupPrivate] = useState(false);
  const [dmUsername, setDmUsername] = useState('');
  const [dmRestrictionUsername, setDmRestrictionUsername] = useState<string | null>(null);
  const [dmRestrictionBusy, setDmRestrictionBusy] = useState(false);
  const [composeText, setComposeText] = useState('');
  const [composeImageUrl, setComposeImageUrl] = useState('');
  const [sendType, setSendType] = useState<'text' | 'image'>('text');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviteFriends, setInviteFriends] = useState<FriendUser[]>([]);
  const [inviteFriendsLoaded, setInviteFriendsLoaded] = useState(false);
  const [inviteFriendsLoading, setInviteFriendsLoading] = useState(false);
  const [inviteDropdownOpen, setInviteDropdownOpen] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const selectedGroupIdRef = useRef<number | null>(null);
  const loadingMessagesGroupIdRef = useRef<number | null>(null);

  const canUseChat = useMemo(() => Boolean(user), [user]);

  const myGroupById = useMemo(() => new Map<number, ChatGroup>(myGroups.map((g) => [g.id, g])), [myGroups]);

  const selectGroup = (g: ChatGroup | null) => {
    setSelectedGroup(g);
    setError(null);
    setNotice(null);
    setMessages([]);
    setNextCursor(null);
    setShowMembers(false);
    setMembers([]);
    if (!g) return;
    setSearchParams({ groupId: String(g.id) }, { replace: true });
  };

  const selectedTitle = useMemo(() => {
    if (!selectedGroup) return 'Select a group';
    if (selectedGroup.isDm && selectedGroup.dmWithUsername) return `DM with @${selectedGroup.dmWithUsername}`;
    return selectedGroup.name;
  }, [selectedGroup]);

  const selectedBadge = useMemo(() => {
    if (!selectedGroup) return null;
    if (selectedGroup.isDm) return { label: 'DM', tone: 'accent' as const };
    if (selectedGroup.isPrivate) return { label: 'Private', tone: 'muted' as const };
    return { label: 'Public', tone: 'muted' as const };
  }, [selectedGroup]);

  useEffect(() => {
    if (!user) return;
    const s = getSocket();
    const update = () => setSocketConnected(Boolean(s.connected));
    update();
    s.on('connect', update);
    s.on('disconnect', update);
    return () => {
      s.off('connect', update);
      s.off('disconnect', update);
    };
  }, [user?.id]);

  const refreshLists = async () => {
    const [pub] = await Promise.all([chatApi.listPublicGroups()]);
    setPublicGroups(pub.items);

    if (user) {
      const [mine, inv] = await Promise.all([chatApi.listMyGroups(), chatApi.listInvites()]);
      setMyGroups(mine.items);
      setInvites(inv.items);
    } else {
      setMyGroups([]);
      setInvites([]);
    }
  };

  const loadMessages = async (reset: boolean) => {
    const groupId = selectedGroup?.id;
    if (!groupId) return;
    setLoadingMessages(true);
    loadingMessagesGroupIdRef.current = groupId;
    try {
      const res = await chatApi.listMessages(groupId, {
        limit: 30,
        cursor: reset ? null : nextCursor,
      });
      if (selectedGroupIdRef.current !== groupId) return;
      setMessages((prev) => (reset ? res.items : [...res.items, ...prev]));
      setNextCursor(res.nextCursor);
    } catch (err) {
      if (selectedGroupIdRef.current !== groupId) return;
      setError(err instanceof Error ? err.message : 'Failed to load messages');
    } finally {
      if (loadingMessagesGroupIdRef.current === groupId) setLoadingMessages(false);
    }
  };

  const loadMembers = async () => {
    if (!user || !selectedGroup) return;
    if (selectedGroup.isDm) {
      setMembers([]);
      return;
    }

    setLoadingMembers(true);
    try {
      const res = await chatApi.listMembers(selectedGroup.id);
      setMembers(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load members');
    } finally {
      setLoadingMembers(false);
    }
  };

  useEffect(() => {
    selectedGroupIdRef.current = selectedGroup?.id ?? null;
  }, [selectedGroup?.id]);

  useEffect(() => {
    void refreshLists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    const groupIdStr = searchParams.get('groupId');
    if (!groupIdStr) return;
    const groupId = Number(groupIdStr);
    if (!Number.isFinite(groupId)) return;
    if (selectedGroupIdRef.current === groupId) return;

    const g = myGroups.find((x) => x.id === groupId) ?? null;
    if (g) setSelectedGroup(g);
  }, [myGroups, searchParams]);

  useEffect(() => {
    if (!user) return;
    const off = chatSocket.onEvent((event) => {
      if (event.type !== 'chat_message') return;
      if (!selectedGroup || event.message.groupId !== selectedGroup.id) return;
      setMessages((prev) => [...prev, event.message]);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 0);
    });
    return off;
  }, [selectedGroup?.id, user]);

  const canInvite = Boolean(
    user && selectedGroup && selectedGroup.isPrivate && !selectedGroup.isDm && selectedGroup.myRole === 'admin',
  );

  const loadInviteFriends = async () => {
    if (!user) return;
    if (inviteFriendsLoaded || inviteFriendsLoading) return;
    setInviteFriendsLoading(true);
    try {
      const res = await friendsApi.listMine({ limit: 200 });
      setInviteFriends(res.items);
      setInviteFriendsLoaded(true);
    } catch {
      // Non-fatal: invite can still work by typing.
    } finally {
      setInviteFriendsLoading(false);
    }
  };

  const inviteSuggestions = useMemo(() => {
    if (!inviteDropdownOpen) return [];
    const q = inviteUsername.trim().toLowerCase();
    const base = q
      ? inviteFriends.filter((f) => {
          const u = f.username.toLowerCase();
          const dn = (f.displayName ?? '').toLowerCase();
          return u.includes(q) || dn.includes(q);
        })
      : inviteFriends;
    return base.slice(0, 8);
  }, [inviteDropdownOpen, inviteFriends, inviteUsername]);

  useEffect(() => {
    let cancelled = false;
    const groupId = selectedGroup?.id ?? null;
    if (!user || !groupId) return;

    const join = async () => {
      setError(null);
      try {
        setShowMembers(false);
        setMembers([]);
        await chatSocket.join(groupId);
        if (cancelled) return;
        await loadMessages(true);
        if (cancelled) return;
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'auto' }), 0);

        // Auto-mark message notifications read when opening a thread.
        try {
          await notificationsApi.markReadByEntity({
            entityType: 'chat_group',
            entityId: groupId,
            types: ['message_received'],
          });
          requestUnreadRefresh();
        } catch {
          // Non-fatal
        }
      } catch (err) {
        if (cancelled) return;
        if (selectedGroupIdRef.current !== groupId) return;
        setError(err instanceof Error ? err.message : 'Failed to join group');
      }
    };

    void join();

    return () => {
      cancelled = true;
      void chatSocket.leave(groupId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGroup?.id, user?.id]);

  const canManageMembers = Boolean(user && selectedGroup && !selectedGroup.isDm && selectedGroup.myRole === 'admin');

  const promote = async (memberUserId: number) => {
    if (!selectedGroup) return;
    setError(null);
    try {
      await chatApi.promoteMember(selectedGroup.id, memberUserId);
      await refreshLists();
      await loadMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to promote');
    }
  };

  const demote = async (memberUserId: number) => {
    if (!selectedGroup) return;
    setError(null);
    try {
      await chatApi.demoteMember(selectedGroup.id, memberUserId);
      await refreshLists();
      await loadMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to demote');
    }
  };

  const remove = async (memberUserId: number) => {
    if (!selectedGroup) return;
    setError(null);
    try {
      await chatApi.removeMember(selectedGroup.id, memberUserId);
      await refreshLists();
      await loadMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove');
    }
  };

  const createGroup = async () => {
    if (!user) return;
    setError(null);
    const name = newGroupName.trim();
    if (!name) {
      setError('Group name required');
      return;
    }

    try {
      const res = await chatApi.createGroup({ name, isPrivate: newGroupPrivate });
      setNewGroupName('');
      setNewGroupPrivate(false);
      await refreshLists();
      const mine = await chatApi.listMyGroups();
      const created = mine.items.find((g) => g.id === res.id) ?? null;
      setSelectedGroup(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create group');
    }
  };

  const startDm = async () => {
    if (!user) return;
    setError(null);
    setDmRestrictionUsername(null);
    const username = dmUsername.trim();
    if (!username) {
      setError('Username required');
      return;
    }

    try {
      const res = await chatApi.startDm(username);
      setDmUsername('');
      await refreshLists();
      const mine = await chatApi.listMyGroups();
      const g = mine.items.find((x) => x.id === res.groupId) ?? null;
      setSelectedGroup(g);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start DM';
      setError(msg);
      if (msg.toLowerCase().includes('only message friends')) {
        setDmRestrictionUsername(username);
      }
    }
  };

  const joinGroup = async (groupId: number) => {
    if (!user) return;
    setError(null);
    try {
      await chatApi.joinGroup(groupId);
      await refreshLists();
      const mine = await chatApi.listMyGroups();
      const g = mine.items.find((x) => x.id === groupId) ?? null;
      selectGroup(g);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join');
    }
  };

  const openPublicGroup = async (groupId: number) => {
    const existing = myGroupById.get(groupId) ?? null;
    if (existing) {
      selectGroup(existing);
      return;
    }
    await joinGroup(groupId);
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedGroup) return;

    setError(null);
    setNotice(null);
    try {
      if (sendType === 'text') {
        const t = composeText.trim();
        if (!t) return;
        await chatSocket.send({ groupId: selectedGroup.id, type: 'text', text: t });
        setComposeText('');
      } else {
        const url = composeImageUrl.trim();
        if (!url) return;
        await chatSocket.send({ groupId: selectedGroup.id, type: 'image', imageUrl: url });
        setComposeImageUrl('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send');
    }
  };

  const invite = async () => {
    if (!user || !selectedGroup) return;
    setError(null);
    setNotice(null);

    const username = inviteUsername.trim();
    if (!username) {
      setError('Username required');
      return;
    }

    try {
      await chatApi.inviteToGroup(selectedGroup.id, username);
      setInviteUsername('');
      setNotice(`Invited @${username}`);
      await refreshLists();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to invite');
    }
  };

  if (!canUseChat) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="ui-title text-xl">Chat</h1>
        <div className="ui-panel ui-panel-soft mt-4 p-4 text-sm text-gray-700 dark:text-gray-300">Login to use chat.</div>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 px-4 py-6 md:grid-cols-[320px_1fr]">
      <aside className="space-y-4">
        <div className="ui-panel ui-panel-soft p-3">
          <div className="text-sm font-semibold">Start DM</div>
          <div className="mt-2 flex gap-2">
            <input
              value={dmUsername}
              onChange={(e) => setDmUsername(e.target.value)}
              placeholder="Username"
              className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-800 dark:bg-gray-950"
            />
            <button
              onClick={() => void startDm()}
              className="ui-btn ui-btn-primary shrink-0 px-3 py-2"
            >
              Go
            </button>
          </div>

          {dmRestrictionUsername ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <div className="text-xs text-gray-600 dark:text-gray-400">You can only message friends. Send a friend request first.</div>
              <button
                disabled={dmRestrictionBusy}
                onClick={async () => {
                  setDmRestrictionBusy(true);
                  setError(null);
                  setNotice(null);
                  try {
                    const p = await usersApi.getProfile(dmRestrictionUsername);
                    await friendsApi.sendRequest(p.id);
                    setNotice(`Friend request sent to @${dmRestrictionUsername}`);
                    setDmRestrictionUsername(null);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Failed to send friend request');
                  } finally {
                    setDmRestrictionBusy(false);
                  }
                }}
                className="rounded-md border px-3 py-1.5 text-sm transition-colors disabled:opacity-50 dark:border-gray-800 dark:hover:bg-gray-800"
                type="button"
              >
                {dmRestrictionBusy ? 'Sending…' : 'Send friend request'}
              </button>
            </div>
          ) : null}
        </div>

        <div className="ui-panel ui-panel-soft p-3">
          <div className="text-sm font-semibold">Create group</div>
          <div className="mt-2 space-y-2">
            <input
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="Group name"
              className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-800 dark:bg-gray-950"
            />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={newGroupPrivate} onChange={(e) => setNewGroupPrivate(e.target.checked)} />
              Private (invite required)
            </label>
            <button
              onClick={() => void createGroup()}
              className="ui-btn ui-btn-primary w-full px-3 py-2"
            >
              Create
            </button>
          </div>
        </div>

        <div className="ui-panel ui-panel-soft p-3">
          <div className="text-sm font-semibold">Invites</div>
          <div className="mt-2 space-y-2">
            {invites.length === 0 ? <div className="text-sm text-gray-600 dark:text-gray-400">No invites</div> : null}
            {invites.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between gap-2 rounded-md border px-2 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{inv.groupName}</div>
                  <div className="truncate text-xs text-gray-500 dark:text-gray-400">{inv.groupDescription ?? ''}</div>
                </div>
                <button
                  onClick={() => void joinGroup(inv.groupId)}
                  className="ui-btn shrink-0 px-2 py-1 text-xs"
                >
                  Join
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="ui-panel ui-panel-soft p-3">
          <div className="text-sm font-semibold">My groups</div>
          <div className="mt-2 space-y-2">
            {myGroups.map((g) => (
              <button
                key={g.id}
                onClick={() => selectGroup(g)}
                className={`ui-row ${selectedGroup?.id === g.id ? 'text-gray-900 dark:text-gray-100' : 'text-gray-900 dark:text-gray-100'}`}
                style={
                  selectedGroup?.id === g.id
                    ? {
                        backgroundColor: 'rgb(var(--ui-accent-rgb) / 0.14)',
                        borderColor: 'rgb(var(--ui-accent-rgb) / 0.55)',
                      }
                    : {
                        backgroundColor: 'rgb(var(--ui-surface-2-rgb) / 0.45)',
                        borderColor: 'rgb(var(--ui-border-rgb) / 0.6)',
                      }
                }
              >
                <div className="font-medium">{g.isDm && g.dmWithUsername ? `DM with @${g.dmWithUsername}` : g.name}</div>
                <div className={`text-xs ${selectedGroup?.id === g.id ? 'text-gray-200 dark:text-gray-600' : 'text-gray-500 dark:text-gray-400'}`}>
                  {g.isDm ? 'Direct message' : g.isPrivate ? 'Private' : 'Public'}
                  {g.myRole === 'admin' ? ' • Admin' : ''}
                </div>
              </button>
            ))}
            {myGroups.length === 0 ? <div className="text-sm text-gray-600 dark:text-gray-400">No groups yet</div> : null}
          </div>
        </div>

        <div className="ui-panel ui-panel-soft p-3">
          <div className="text-sm font-semibold">Public groups</div>
          <div className="mt-2 space-y-2">
            {publicGroups.map((g) => (
              <div key={g.id} className="flex items-center justify-between gap-2 rounded-md border px-2 py-2">
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => void openPublicGroup(g.id)}
                    className="block w-full truncate text-left text-sm font-medium hover:underline"
                  >
                    {g.name}
                  </button>
                  <div className="truncate text-xs text-gray-500 dark:text-gray-400">{g.memberCount ?? 0} members</div>
                </div>
                <button
                  onClick={() => void openPublicGroup(g.id)}
                  className="ui-btn shrink-0 px-2 py-1 text-xs"
                >
                  {myGroupById.has(g.id) ? 'Open' : 'Join'}
                </button>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <main className="ui-panel">
        <div className="border-b px-4 py-3" style={{ borderColor: 'rgb(var(--ui-border-rgb) / 0.6)' }}>
          <div className="text-sm text-gray-500 dark:text-gray-400">Chat</div>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="ui-title truncate text-lg">{selectedTitle}</div>
                {selectedBadge ? (
                  <span
                    className={`ui-badge ui-system ${selectedBadge.tone === 'accent' ? '' : ''}`}
                    style={
                      selectedBadge.tone === 'accent'
                        ? { borderColor: 'rgb(var(--ui-accent-rgb) / 0.55)', backgroundColor: 'rgb(var(--ui-accent-rgb) / 0.12)' }
                        : undefined
                    }
                  >
                    {selectedBadge.label}
                  </span>
                ) : null}
                {user ? (
                  <span className="ui-system text-xs" style={{ color: socketConnected ? 'rgb(34 197 94)' : 'rgb(239 68 68)' }}>
                    {socketConnected ? 'CONNECTED' : 'OFFLINE'}
                  </span>
                ) : null}
              </div>
              {selectedGroup && !selectedGroup.isDm ? (
                <div className="ui-muted ui-system mt-1 text-xs">
                  {showMembers ? `${members.length} members loaded` : 'Members hidden'}
                </div>
              ) : null}
            </div>
            {selectedGroup && !selectedGroup.isDm ? (
              <button
                type="button"
                onClick={async () => {
                  const next = !showMembers;
                  setShowMembers(next);
                  if (next) await loadMembers();
                }}
                className="ui-btn shrink-0 px-2 py-1 text-xs"
                disabled={loadingMembers}
              >
                {loadingMembers ? 'Loading…' : showMembers ? 'Hide members' : 'Members'}
              </button>
            ) : null}
          </div>
        </div>

        {error ? <div className="px-4 py-2"><div className="ui-error">{error}</div></div> : null}
        {notice ? <div className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">{notice}</div> : null}

        {selectedGroup && canInvite ? (
          <div className="border-b px-4 py-3" style={{ borderColor: 'rgb(var(--ui-border-rgb) / 0.6)' }}>
            <div className="text-sm font-medium">Invite username</div>
            <div className="mt-2 flex gap-2">
              <div className="relative w-full">
                <input
                  value={inviteUsername}
                  onChange={(e) => {
                    setInviteUsername(e.target.value);
                    setInviteDropdownOpen(true);
                    void loadInviteFriends();
                  }}
                  onFocus={() => {
                    setInviteDropdownOpen(true);
                    void loadInviteFriends();
                  }}
                  onBlur={() => {
                    setTimeout(() => setInviteDropdownOpen(false), 150);
                  }}
                  placeholder="Search friends"
                  className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-800 dark:bg-gray-950"
                />

                {inviteDropdownOpen ? (
                  <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border p-1 shadow-sm" style={{ borderColor: 'rgb(var(--ui-border-rgb) / 0.6)', backgroundColor: 'rgb(var(--ui-surface-rgb) / 0.9)', backdropFilter: 'blur(10px)' }}>
                    {inviteFriendsLoading ? <div className="px-2 py-1.5 text-xs text-gray-600 dark:text-gray-400">Loading…</div> : null}
                    {!inviteFriendsLoading && inviteSuggestions.length === 0 ? (
                      <div className="px-2 py-1.5 text-xs text-gray-600 dark:text-gray-400">No friends found</div>
                    ) : null}
                    {inviteSuggestions.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => {
                          setInviteUsername(f.username);
                          setInviteDropdownOpen(false);
                        }}
                        className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                      >
                        <span className="truncate font-medium">@{f.username}</span>
                        <span className="truncate text-xs text-gray-500 dark:text-gray-400">{f.displayName ?? ''}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <button
                onClick={() => void invite()}
                className="ui-btn ui-btn-primary shrink-0 px-3 py-2"
                type="button"
              >
                Invite
              </button>
            </div>
          </div>
        ) : null}

        {selectedGroup && !selectedGroup.isDm && showMembers ? (
          <div className="border-b px-4 py-3 ui-appear-up" style={{ borderColor: 'rgb(var(--ui-border-rgb) / 0.6)' }}>
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Members</div>
              <button
                type="button"
                onClick={() => void loadMembers()}
                className="ui-btn px-2 py-1 text-xs"
                disabled={loadingMembers}
              >
                {loadingMembers ? 'Loading…' : 'Refresh'}
              </button>
            </div>
            <div className="mt-2 space-y-2">
              {members.length === 0 ? <div className="text-sm text-gray-600 dark:text-gray-400">No members to show</div> : null}
              {members.map((m) => {
                const isSelf = user?.id === m.id;
                const showActions = canManageMembers && !isSelf;
                return (
                  <div key={m.id} className="flex items-center justify-between gap-2 rounded-md border px-2 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        @{m.username}
                        {m.role === 'admin' ? ' • Admin' : ''}
                      </div>
                      <div className="truncate text-xs text-gray-500">Joined <Timestamp value={m.joinedAt} variant="date" /></div>
                    </div>
                    {showActions ? (
                      <div className="flex shrink-0 items-center gap-2">
                        {m.role === 'admin' ? (
                          <button
                            type="button"
                            onClick={() => void demote(m.id)}
                            className="ui-btn px-2 py-1 text-xs"
                          >
                            Demote
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void promote(m.id)}
                            className="ui-btn px-2 py-1 text-xs"
                          >
                            Promote
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            if (!confirm(`Remove @${m.username} from this group?`)) return;
                            void remove(m.id);
                          }}
                          className="ui-btn px-2 py-1 text-xs"
                        >
                          Remove
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {selectedGroup ? (
          <>
            <div key={selectedGroup.id} className="h-[60vh] overflow-y-auto px-4 py-3 ui-appear">
              <div className="flex justify-center">
                <button
                  disabled={loadingMessages || !nextCursor}
                  onClick={() => void loadMessages(false)}
                  className="ui-btn px-3 py-1 text-xs disabled:opacity-50"
                >
                  {nextCursor ? (loadingMessages ? 'Loading…' : 'Load older') : 'No more'}
                </button>
              </div>

              <div className="mt-3 space-y-2">
                {messages.map((m) => (
                  <MessageView key={m.id} msg={m} currentUser={user!} />
                ))}
                {loadingMessages && messages.length === 0 ? (
                  <div className="space-y-2">
                    <div className="ui-skeleton h-10 w-2/3" />
                    <div className="ui-skeleton h-10 w-1/2 ml-auto" />
                    <div className="ui-skeleton h-10 w-2/3" />
                  </div>
                ) : null}
                <div ref={bottomRef} />
              </div>
            </div>

            <form onSubmit={send} className="border-t px-4 py-3" style={{ borderColor: 'rgb(var(--ui-border-rgb) / 0.6)' }}>
              <div className="flex items-center gap-2">
                <select
                  value={sendType}
                  onChange={(e) => setSendType(e.target.value as 'text' | 'image')}
                  className="rounded-md border px-2 py-2 text-sm dark:border-gray-800 dark:bg-gray-950"
                >
                  <option value="text">Text</option>
                  <option value="image">Image URL</option>
                </select>

                {sendType === 'text' ? (
                  <input
                    value={composeText}
                    onChange={(e) => setComposeText(e.target.value)}
                    placeholder="Message"
                    className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-800 dark:bg-gray-950"
                  />
                ) : (
                  <input
                    value={composeImageUrl}
                    onChange={(e) => setComposeImageUrl(e.target.value)}
                    placeholder="https://…"
                    className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-800 dark:bg-gray-950"
                  />
                )}

                <button className="ui-btn ui-btn-primary px-3 py-2">Send</button>
              </div>
            </form>
          </>
        ) : (
          <div className="px-4 py-6 text-sm text-gray-700 dark:text-gray-300">Pick a group from the left.</div>
        )}
      </main>
    </div>
  );
}
