import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/sqlite.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { areFriends } from '../social/visibility.js';

export const chatRouter = Router();

const createGroupSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(500).optional().or(z.literal('')),
  isPrivate: z.boolean().optional(),
});

const inviteSchema = z.object({
  username: z.string().min(1).max(50),
});

const sendMessageSchema = z
  .object({
    type: z.enum(['text', 'image']).default('text'),
    text: z.string().max(5000).optional().or(z.literal('')),
    imageUrl: z.string().url().max(500).optional().or(z.literal('')),
  })
  .refine((v) => (v.type === 'text' ? Boolean(v.text && v.text.trim()) : Boolean(v.imageUrl && v.imageUrl.trim())), {
    message: 'Message content required',
  });

const requireGroupMember = async (groupId: number, userId: number) => {
  const db = await getDb();
  const row = await db.get<{ role: 'member' | 'admin' }>(
    'SELECT role FROM chat_group_members WHERE group_id = ? AND user_id = ?',
    groupId,
    userId,
  );
  return row ?? null;
};

const requireGroupAdmin = async (groupId: number, userId: number) => {
  const member = await requireGroupMember(groupId, userId);
  if (!member || member.role !== 'admin') return false;
  return true;
};

const isDmGroup = async (groupId: number): Promise<boolean> => {
  const db = await getDb();
  const row = await db.get('SELECT 1 FROM chat_direct_threads WHERE group_id = ?', groupId);
  return Boolean(row);
};

chatRouter.get('/groups/public', async (_req, res) => {
  const db = await getDb();
  const rows = await db.all<
    {
      id: number;
      name: string;
      description: string | null;
      is_private: 0 | 1;
      created_at: string;
      member_count: number;
    }[]
  >(
    `SELECT g.id, g.name, g.description, g.is_private, g.created_at,
            (SELECT COUNT(*) FROM chat_group_members m WHERE m.group_id = g.id) AS member_count
     FROM chat_groups g
     WHERE g.is_private = 0
     ORDER BY g.created_at DESC
     LIMIT 100`,
  );

  return res.json({
    items: rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      isPrivate: Boolean(r.is_private),
      createdAt: r.created_at,
      memberCount: r.member_count,
    })),
  });
});

chatRouter.get('/groups/mine', requireAuth, async (req, res) => {
  const userId = Number((req as AuthedRequest).user.sub);
  const db = await getDb();

  const rows = await db.all<
    {
      id: number;
      name: string;
      description: string | null;
      is_private: 0 | 1;
      created_at: string;
      role: 'member' | 'admin';
      last_message_at: string | null;
      is_dm: 0 | 1;
      dm_with_username: string | null;
    }[]
  >(
    `SELECT g.id, g.name, g.description, g.is_private, g.created_at,
            m.role,
            (SELECT MAX(created_at) FROM chat_messages msg WHERE msg.group_id = g.id) AS last_message_at,
            CASE WHEN dt.group_id IS NULL THEN 0 ELSE 1 END AS is_dm,
            CASE
              WHEN dt.group_id IS NULL THEN NULL
              WHEN dt.user_low_id = ? THEN u_high.username
              ELSE u_low.username
            END AS dm_with_username
     FROM chat_group_members m
     JOIN chat_groups g ON g.id = m.group_id
     LEFT JOIN chat_direct_threads dt ON dt.group_id = g.id
     LEFT JOIN users u_low ON u_low.id = dt.user_low_id
     LEFT JOIN users u_high ON u_high.id = dt.user_high_id
     WHERE m.user_id = ?
     ORDER BY COALESCE(last_message_at, g.created_at) DESC
     LIMIT 200`,
    userId,
    userId,
  );

  return res.json({
    items: rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      isPrivate: Boolean(r.is_private),
      createdAt: r.created_at,
      myRole: r.role,
      lastMessageAt: r.last_message_at,
      isDm: Boolean(r.is_dm),
      dmWithUsername: r.dm_with_username,
    })),
  });
});

chatRouter.get('/groups/invites', requireAuth, async (req, res) => {
  const userId = Number((req as AuthedRequest).user.sub);
  const db = await getDb();

  const rows = await db.all<
    {
      id: number;
      group_id: number;
      created_at: string;
      name: string;
      description: string | null;
    }[]
  >(
    `SELECT i.id, i.group_id, i.created_at, g.name, g.description
     FROM chat_group_invites i
     JOIN chat_groups g ON g.id = i.group_id
     WHERE i.invited_user_id = ?
     ORDER BY i.created_at DESC`,
    userId,
  );

  return res.json({
    items: rows.map((r) => ({
      id: r.id,
      groupId: r.group_id,
      groupName: r.name,
      groupDescription: r.description,
      createdAt: r.created_at,
    })),
  });
});

chatRouter.post('/groups', requireAuth, async (req, res) => {
  const parsed = createGroupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });

  const userId = Number((req as AuthedRequest).user.sub);
  const { name, description, isPrivate } = parsed.data;

  const db = await getDb();
  await db.exec('BEGIN');
  try {
    const result = await db.run(
      'INSERT INTO chat_groups(name, description, is_private, created_by) VALUES (?, ?, ?, ?)',
      name,
      description && description.trim() ? description.trim() : null,
      isPrivate ? 1 : 0,
      userId,
    );
    const groupId = result.lastID as number;

    await db.run(
      "INSERT INTO chat_group_members(group_id, user_id, role) VALUES (?, ?, 'admin')",
      groupId,
      userId,
    );

    await db.exec('COMMIT');
    return res.json({ id: groupId });
  } catch (err) {
    await db.exec('ROLLBACK');
    throw err;
  }
});

chatRouter.post('/groups/:id/join', requireAuth, async (req, res) => {
  const groupId = Number(req.params.id);
  if (!Number.isFinite(groupId)) return res.status(400).json({ error: 'Invalid group id' });

  const userId = Number((req as AuthedRequest).user.sub);
  const db = await getDb();

  const group = await db.get<{ is_private: 0 | 1; created_by: number }>(
    'SELECT is_private, created_by FROM chat_groups WHERE id = ?',
    groupId,
  );
  if (!group) return res.status(404).json({ error: 'Group not found' });

  const existing = await db.get('SELECT 1 FROM chat_group_members WHERE group_id = ? AND user_id = ?', groupId, userId);
  if (existing) return res.json({ ok: true });

  if (group.is_private) {
    // Let the group creator re-join their own private group without an invite.
    // (Otherwise, if they ever leave, there is no way back.)
    if (group.created_by === userId) {
      await db.run("INSERT INTO chat_group_members(group_id, user_id, role) VALUES (?, ?, 'admin')", groupId, userId);
      return res.json({ ok: true });
    }

    const invite = await db.get(
      'SELECT id FROM chat_group_invites WHERE group_id = ? AND invited_user_id = ?',
      groupId,
      userId,
    );
    if (!invite) return res.status(403).json({ error: 'Invite required' });

    await db.exec('BEGIN');
    try {
      await db.run('DELETE FROM chat_group_invites WHERE id = ?', (invite as { id: number }).id);
      await db.run("INSERT INTO chat_group_members(group_id, user_id, role) VALUES (?, ?, 'member')", groupId, userId);
      await db.exec('COMMIT');
    } catch (err) {
      await db.exec('ROLLBACK');
      throw err;
    }

    return res.json({ ok: true });
  }

  await db.run("INSERT INTO chat_group_members(group_id, user_id, role) VALUES (?, ?, 'member')", groupId, userId);
  return res.json({ ok: true });
});

chatRouter.post('/groups/:id/leave', requireAuth, async (req, res) => {
  const groupId = Number(req.params.id);
  if (!Number.isFinite(groupId)) return res.status(400).json({ error: 'Invalid group id' });

  const userId = Number((req as AuthedRequest).user.sub);
  const db = await getDb();
  await db.run('DELETE FROM chat_group_members WHERE group_id = ? AND user_id = ?', groupId, userId);
  return res.json({ ok: true });
});

chatRouter.post('/groups/:id/invite', requireAuth, async (req, res) => {
  const groupId = Number(req.params.id);
  if (!Number.isFinite(groupId)) return res.status(400).json({ error: 'Invalid group id' });

  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });

  const inviterId = Number((req as AuthedRequest).user.sub);
  const isAdmin = await requireGroupAdmin(groupId, inviterId);
  if (!isAdmin) return res.status(403).json({ error: 'Group admin only' });

  const db = await getDb();
  const user = await db.get<{ id: number }>('SELECT id FROM users WHERE username = ?', parsed.data.username);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const group = await db.get<{ is_private: 0 | 1 }>('SELECT is_private FROM chat_groups WHERE id = ?', groupId);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  if (!group.is_private) return res.status(400).json({ error: 'Invites only for private groups' });

  const canInviteUser = await areFriends(inviterId, user.id);
  if (!canInviteUser) return res.status(403).json({ error: 'You can only invite friends' });

  await db.run(
    'INSERT OR IGNORE INTO chat_group_invites(group_id, invited_user_id, invited_by_user_id) VALUES (?, ?, ?)',
    groupId,
    user.id,
    inviterId,
  );

  return res.json({ ok: true });
});

chatRouter.get('/groups/:id/messages', requireAuth, async (req, res) => {
  const groupId = Number(req.params.id);
  if (!Number.isFinite(groupId)) return res.status(400).json({ error: 'Invalid group id' });

  const userId = Number((req as AuthedRequest).user.sub);
  const member = await requireGroupMember(groupId, userId);
  if (!member) return res.status(403).json({ error: 'Join the group first' });

  const limit = Math.min(Number(req.query.limit ?? 30), 100);
  const cursor = req.query.cursor ? Number(req.query.cursor) : null; // message id

  const db = await getDb();
  const whereCursor = cursor ? 'AND msg.id < ?' : '';

  const rows = await db.all<
    {
      id: number;
      type: 'text' | 'image';
      text: string | null;
      image_url: string | null;
      created_at: string;
      user_id: number;
      username: string;
      display_name: string | null;
      avatar_url: string | null;
    }[]
  >(
    `SELECT msg.id, msg.type, msg.text, msg.image_url, msg.created_at,
            u.id AS user_id, u.username, u.display_name, u.avatar_url
     FROM chat_messages msg
     JOIN users u ON u.id = msg.user_id
     WHERE msg.group_id = ?
     ${whereCursor}
     ORDER BY msg.id DESC
     LIMIT ?`,
    ...(cursor ? [groupId, cursor, limit + 1] : [groupId, limit + 1]),
  );

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1]?.id ?? null : null;

  // Return ascending for UI.
  const asc = [...items].reverse();

  return res.json({
    items: asc.map((r) => ({
      id: r.id,
      groupId,
      type: r.type,
      text: r.text,
      imageUrl: r.image_url,
      createdAt: r.created_at,
      user: { id: r.user_id, username: r.username, displayName: r.display_name, avatarUrl: r.avatar_url },
    })),
    nextCursor,
  });
});

chatRouter.get('/groups/:id/members', requireAuth, async (req, res) => {
  const groupId = Number(req.params.id);
  if (!Number.isFinite(groupId)) return res.status(400).json({ error: 'Invalid group id' });

  const userId = Number((req as AuthedRequest).user.sub);
  const member = await requireGroupMember(groupId, userId);
  if (!member) return res.status(403).json({ error: 'Join the group first' });

  const db = await getDb();
  const rows = await db.all<
    {
      user_id: number;
      username: string;
      display_name: string | null;
      avatar_url: string | null;
      role: 'member' | 'admin';
      joined_at: string;
    }[]
  >(
    `SELECT m.user_id, u.username, u.display_name, u.avatar_url, m.role, m.joined_at
     FROM chat_group_members m
     JOIN users u ON u.id = m.user_id
     WHERE m.group_id = ?
     ORDER BY CASE m.role WHEN 'admin' THEN 0 ELSE 1 END, m.joined_at ASC`,
    groupId,
  );

  return res.json({
    items: rows.map((r) => ({
      id: r.user_id,
      username: r.username,
      displayName: r.display_name,
      avatarUrl: r.avatar_url,
      role: r.role,
      joinedAt: r.joined_at,
    })),
  });
});

chatRouter.post('/groups/:id/members/:userId/promote', requireAuth, async (req, res) => {
  const groupId = Number(req.params.id);
  const targetUserId = Number(req.params.userId);
  if (!Number.isFinite(groupId) || !Number.isFinite(targetUserId)) return res.status(400).json({ error: 'Invalid id' });

  const actorId = Number((req as AuthedRequest).user.sub);
  const isAdmin = await requireGroupAdmin(groupId, actorId);
  if (!isAdmin) return res.status(403).json({ error: 'Group admin only' });

  if (await isDmGroup(groupId)) return res.status(400).json({ error: 'Not supported for DMs' });

  const db = await getDb();
  const existing = await db.get('SELECT 1 FROM chat_group_members WHERE group_id = ? AND user_id = ?', groupId, targetUserId);
  if (!existing) return res.status(404).json({ error: 'User is not a member' });

  await db.run("UPDATE chat_group_members SET role = 'admin' WHERE group_id = ? AND user_id = ?", groupId, targetUserId);
  return res.json({ ok: true });
});

chatRouter.post('/groups/:id/members/:userId/demote', requireAuth, async (req, res) => {
  const groupId = Number(req.params.id);
  const targetUserId = Number(req.params.userId);
  if (!Number.isFinite(groupId) || !Number.isFinite(targetUserId)) return res.status(400).json({ error: 'Invalid id' });

  const actorId = Number((req as AuthedRequest).user.sub);
  const isAdmin = await requireGroupAdmin(groupId, actorId);
  if (!isAdmin) return res.status(403).json({ error: 'Group admin only' });

  if (await isDmGroup(groupId)) return res.status(400).json({ error: 'Not supported for DMs' });

  const db = await getDb();
  const target = await db.get<{ role: 'member' | 'admin' }>(
    'SELECT role FROM chat_group_members WHERE group_id = ? AND user_id = ?',
    groupId,
    targetUserId,
  );
  if (!target) return res.status(404).json({ error: 'User is not a member' });
  if (target.role !== 'admin') return res.json({ ok: true });

  const adminCount = (await db.get<{ c: number }>(
    "SELECT COUNT(*) AS c FROM chat_group_members WHERE group_id = ? AND role = 'admin'",
    groupId,
  ))?.c ?? 0;
  if (adminCount <= 1) return res.status(400).json({ error: 'Cannot demote the last admin' });

  await db.run("UPDATE chat_group_members SET role = 'member' WHERE group_id = ? AND user_id = ?", groupId, targetUserId);
  return res.json({ ok: true });
});

chatRouter.delete('/groups/:id/members/:userId', requireAuth, async (req, res) => {
  const groupId = Number(req.params.id);
  const targetUserId = Number(req.params.userId);
  if (!Number.isFinite(groupId) || !Number.isFinite(targetUserId)) return res.status(400).json({ error: 'Invalid id' });

  const actorId = Number((req as AuthedRequest).user.sub);
  const isAdmin = await requireGroupAdmin(groupId, actorId);
  if (!isAdmin) return res.status(403).json({ error: 'Group admin only' });
  if (actorId === targetUserId) return res.status(400).json({ error: 'Use leave to remove yourself' });

  if (await isDmGroup(groupId)) return res.status(400).json({ error: 'Not supported for DMs' });

  const db = await getDb();
  const target = await db.get<{ role: 'member' | 'admin' }>(
    'SELECT role FROM chat_group_members WHERE group_id = ? AND user_id = ?',
    groupId,
    targetUserId,
  );
  if (!target) return res.status(404).json({ error: 'User is not a member' });

  if (target.role === 'admin') {
    const adminCount = (await db.get<{ c: number }>(
      "SELECT COUNT(*) AS c FROM chat_group_members WHERE group_id = ? AND role = 'admin'",
      groupId,
    ))?.c ?? 0;
    if (adminCount <= 1) return res.status(400).json({ error: 'Cannot remove the last admin' });
  }

  await db.run('DELETE FROM chat_group_members WHERE group_id = ? AND user_id = ?', groupId, targetUserId);
  return res.json({ ok: true });
});

chatRouter.post('/groups/:id/messages', requireAuth, async (req, res) => {
  const groupId = Number(req.params.id);
  if (!Number.isFinite(groupId)) return res.status(400).json({ error: 'Invalid group id' });

  const userId = Number((req as AuthedRequest).user.sub);
  const member = await requireGroupMember(groupId, userId);
  if (!member) return res.status(403).json({ error: 'Join the group first' });

  const parsed = sendMessageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });

  const { type, text, imageUrl } = parsed.data;
  const db = await getDb();

  const result = await db.run(
    'INSERT INTO chat_messages(group_id, user_id, type, text, image_url) VALUES (?, ?, ?, ?, ?)',
    groupId,
    userId,
    type,
    type === 'text' ? (text?.trim() ?? '') : null,
    type === 'image' ? (imageUrl?.trim() ?? '') : null,
  );

  return res.json({ id: result.lastID as number });
});

chatRouter.post('/dm/:username', requireAuth, async (req, res) => {
  const otherUsername = String(req.params.username ?? '').trim();
  if (!otherUsername) return res.status(400).json({ error: 'Username required' });

  const userId = Number((req as AuthedRequest).user.sub);
  const myUsername = (req as AuthedRequest).user.username;
  if (otherUsername === myUsername) return res.status(400).json({ error: 'Cannot DM yourself' });

  const db = await getDb();
  const other = await db.get<{ id: number; username: string }>('SELECT id, username FROM users WHERE username = ?', otherUsername);
  if (!other) return res.status(404).json({ error: 'User not found' });

  const friendsOnlyDm = String(process.env.FRIENDS_ONLY_DM ?? 'false').toLowerCase() === 'true';
  if (friendsOnlyDm) {
    const ok = await areFriends(userId, other.id);
    if (!ok) return res.status(403).json({ error: 'You can only message friends. Send a friend request first.' });
  }

  const low = Math.min(userId, other.id);
  const high = Math.max(userId, other.id);

  const existing = await db.get<{ group_id: number }>(
    'SELECT group_id FROM chat_direct_threads WHERE user_low_id = ? AND user_high_id = ?',
    low,
    high,
  );
  if (existing) return res.json({ groupId: existing.group_id });

  await db.exec('BEGIN');
  try {
    // Create a private group for this DM thread.
    const result = await db.run(
      'INSERT INTO chat_groups(name, description, is_private, created_by) VALUES (?, NULL, 1, ?)',
      'DM',
      userId,
    );
    const groupId = result.lastID as number;

    // Add both users as members.
    await db.run("INSERT INTO chat_group_members(group_id, user_id, role) VALUES (?, ?, 'member')", groupId, userId);
    await db.run("INSERT INTO chat_group_members(group_id, user_id, role) VALUES (?, ?, 'member')", groupId, other.id);

    await db.run(
      'INSERT INTO chat_direct_threads(user_low_id, user_high_id, group_id) VALUES (?, ?, ?)',
      low,
      high,
      groupId,
    );

    await db.exec('COMMIT');
    return res.json({ groupId });
  } catch (err) {
    await db.exec('ROLLBACK');
    throw err;
  }
});
