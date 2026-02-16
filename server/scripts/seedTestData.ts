/**
 * Seed realistic test data into the SQLite database.
 *
 * Run:
 *   - From repo root:   npm -w server run seed:test
 *   - Or directly:     npx tsx server/scripts/seedTestData.ts
 *
 * Reset and reseed (DANGEROUS: deletes existing data in the DB):
 *   npm -w server run seed:test -- --force
 */

import { runMigrations } from '../src/db/migrate.js';
import { getDb } from '../src/db/sqlite.js';
import { hashPassword } from '../src/auth/passwords.js';
import { createNotification } from '../src/services/notifications.js';

type SeedUserInput = {
  username: string;
  password: string;
  displayName: string;
  bio: string;
  statusText: string;
};

type SeededUser = {
  id: number;
  username: string;
  role: 'user' | 'admin';
};

type SeededPost = {
  id: number;
  userId: number;
  createdAt: Date;
};

type SeededGroup = {
  id: number;
  isPrivate: boolean;
  memberIds: number[];
};

const parseArgs = (argv: string[]) => {
  // For demo repos, always start from a clean database so the app is usable immediately.
  // Keep parsing for backwards compatibility, but default to force reseed.
  const force = !argv.includes('--no-force');
  return { force };
};

const pad2 = (n: number) => String(n).padStart(2, '0');

const randInt = (minInclusive: number, maxInclusive: number): number => {
  const min = Math.ceil(minInclusive);
  const max = Math.floor(maxInclusive);
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

const randFloat = (minInclusive: number, maxInclusive: number): number => {
  return Math.random() * (maxInclusive - minInclusive) + minInclusive;
};

const pickOne = <T>(arr: T[]): T => {
  if (arr.length === 0) throw new Error('pickOne: empty array');
  return arr[randInt(0, arr.length - 1)]!;
};

const pickSomeUnique = <T>(arr: T[], count: number): T[] => {
  const copy = [...arr];
  const out: T[] = [];
  while (copy.length > 0 && out.length < count) {
    const idx = randInt(0, copy.length - 1);
    out.push(copy[idx]!);
    copy.splice(idx, 1);
  }
  return out;
};

const toSqliteDateTime = (d: Date): string => {
  // SQLite's datetime('now') yields "YYYY-MM-DD HH:MM:SS".
  // Using this format keeps ordering and date()/datetime() queries predictable.
  return d.toISOString().slice(0, 19).replace('T', ' ');
};

const dateWithinLastDays = (days: number): Date => {
  const now = Date.now();
  const msBack = randInt(0, days * 24 * 60 * 60);
  return new Date(now - msBack * 1000);
};

const dateBetween = (start: Date, end: Date): Date => {
  const a = start.getTime();
  const b = end.getTime();
  const t = randFloat(Math.min(a, b), Math.max(a, b));
  return new Date(t);
};

const normalizePair = (a: number, b: number) => (a < b ? { user1: a, user2: b } : { user1: b, user2: a });

const FRIENDS_ONLY_DM = String(process.env.FRIENDS_ONLY_DM ?? 'false').toLowerCase() === 'true';

const resetAllData = async (force: boolean) => {
  const db = await getDb();

  if (!force) return;

  console.log('Resetting database (force)...');
  await db.exec('BEGIN');
  try {
    // Delete children first where it helps readability. Cascades exist on many FKs.
    await db.run('DELETE FROM sessions');
    await db.run('DELETE FROM notifications');

    await db.run('DELETE FROM likes');
    await db.run('DELETE FROM comments');
    await db.run('DELETE FROM posts');

    await db.run('DELETE FROM chat_messages');
    await db.run('DELETE FROM chat_group_invites');
    await db.run('DELETE FROM chat_group_members');
    await db.run('DELETE FROM chat_direct_threads');
    await db.run('DELETE FROM chat_groups');

    await db.run('DELETE FROM friendships');

    await db.run('DELETE FROM users');

    // Reset AUTOINCREMENT counters for cleaner predictable picsum URLs.
    await db.run('DELETE FROM sqlite_sequence');

    await db.exec('COMMIT');
  } catch (err) {
    await db.exec('ROLLBACK');
    throw err;
  }
};

const seedAdmin = async (): Promise<SeededUser> => {
  const db = await getDb();

  const adminUsername = 'admin';
  const adminPassword = 'admin123';

  const existing = await db.get<{ id: number; role: 'user' | 'admin' }>('SELECT id, role FROM users WHERE username = ?', adminUsername);
  if (existing) {
    if (existing.role !== 'admin') {
      await db.run("UPDATE users SET role = 'admin' WHERE id = ?", existing.id);
    }

    // Ensure admin has profile fields filled.
    await db.run(
      'UPDATE users SET display_name = COALESCE(display_name, ?), bio = COALESCE(bio, ?), status_text = COALESCE(status_text, ?) WHERE id = ?',
      'Admin',
      'Administrator account for testing the admin dashboard.',
      'Keeping an eye on things.',
      existing.id,
    );

    // Demo seed should not rely on external image hosts.
    await db.run('UPDATE users SET avatar_url = NULL WHERE id = ?', existing.id);

    console.log(`Admin exists: @${adminUsername}`);
    return { id: existing.id, username: adminUsername, role: 'admin' };
  }

  const passwordHash = await hashPassword(adminPassword);
  const createdAt = toSqliteDateTime(dateWithinLastDays(90));

  const result = await db.run(
    'INSERT INTO users(username, password_hash, role, display_name, bio, status_text, avatar_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    adminUsername,
    passwordHash,
    'admin',
    'Admin',
    'Administrator account for testing the admin dashboard.',
    'Keeping an eye on things.',
    null,
    createdAt,
  );

  const id = result.lastID as number;
  await db.run('UPDATE users SET avatar_url = NULL WHERE id = ?', id);

  console.log(`Created admin: @${adminUsername} (password: ${adminPassword})`);
  return { id, username: adminUsername, role: 'admin' };
};

const seedRegularUsers = async (): Promise<SeededUser[]> => {
  const db = await getDb();

  const base: Array<Omit<SeedUserInput, 'username'>> = [
    {
      password: 'password123',
      displayName: 'Ava Chen',
      bio: 'Coffee enthusiast. Weekend hiker. Taking too many photos.',
      statusText: 'Trying a new playlist.',
    },
    {
      password: 'password123',
      displayName: 'Noah Patel',
      bio: 'I build small apps and overthink UX.',
      statusText: 'Shipping small wins.',
    },
    {
      password: 'password123',
      displayName: 'Mia Rodriguez',
      bio: 'Book notes, messy sketches, and good ramen spots.',
      statusText: 'Reading something interesting.',
    },
    {
      password: 'password123',
      displayName: 'Liam Wong',
      bio: 'Gym, games, and the occasional spicy take.',
      statusText: 'Leg day survived.',
    },
    {
      password: 'password123',
      displayName: 'Sophia Kim',
      bio: 'Trying to cook. Mostly failing. Still optimistic.',
      statusText: 'Testing recipes.',
    },
    {
      password: 'password123',
      displayName: 'Ethan Nguyen',
      bio: 'Minimalist. Notes app power user.',
      statusText: 'Clean desk, clear mind.',
    },
    {
      password: 'password123',
      displayName: 'Isabella Rossi',
      bio: 'City walks and tiny moments.',
      statusText: 'Golden hour soon.',
    },
    {
      password: 'password123',
      displayName: 'Lucas Silva',
      bio: 'Learning, iterating, repeating.',
      statusText: 'Debugging life.',
    },
    {
      password: 'password123',
      displayName: 'Amelia Johnson',
      bio: 'Plants, playlists, and project ideas.',
      statusText: 'New leaf day.',
    },
    {
      password: 'password123',
      displayName: 'Oliver Brown',
      bio: 'Sports, snacks, and bad jokes.',
      statusText: 'On a snack run.',
    },
  ];

  const out: SeededUser[] = [];

  for (let i = 0; i < base.length; i++) {
    const username = `seed_user${pad2(i + 1)}`;
    const existing = await db.get<{ id: number }>('SELECT id FROM users WHERE username = ?', username);
    if (existing) {
      out.push({ id: existing.id, username, role: 'user' });
      continue;
    }

    const createdAt = toSqliteDateTime(dateWithinLastDays(90));
    const passwordHash = await hashPassword(base[i]!.password);

    const result = await db.run(
      'INSERT INTO users(username, password_hash, role, display_name, bio, status_text, avatar_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      username,
      passwordHash,
      'user',
      base[i]!.displayName,
      base[i]!.bio,
      base[i]!.statusText,
      null,
      createdAt,
    );

    const id = result.lastID as number;
    await db.run('UPDATE users SET avatar_url = NULL WHERE id = ?', id);

    out.push({ id, username, role: 'user' });
  }

  return out;
};

const seedPosts = async (users: SeededUser[]): Promise<SeededPost[]> => {
  const db = await getDb();

  const postTemplates = [
    'Small wins today: fixed a bug that was haunting me for days.',
    'Went for a walk and cleared my head. Highly recommend.',
    'Trying out a new feature idea. Might ship it, might delete it.',
    'Hot take: simple UI beats fancy UI most days.',
    'If you’re reading this, drink some water.',
    'Weekend plan: rest + a tiny bit of side-project time.',
    'I finally cleaned up my tabs. It felt weird.',
    'Found a great cafe spot. The vibes are immaculate.',
    'Progress > perfection.',
    'Note to self: write tests earlier next time.',
  ];

  const posts: SeededPost[] = [];

  for (const u of users) {
    const count = randInt(3, 5);
    for (let i = 0; i < count; i++) {
      const createdAt = dateWithinLastDays(30);

      const r = Math.random();
      const visibility = r < 0.7 ? 'public' : r < 0.9 ? 'friends' : 'private';

      // Demo seed should not rely on external images.
      const wantsImage = false;

      const result = await db.run(
        'INSERT INTO posts(user_id, text, image_url, visibility, like_count, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, NULL)',
        u.id,
        pickOne(postTemplates),
        null,
        visibility,
        toSqliteDateTime(createdAt),
      );

      const postId = result.lastID as number;
      if (wantsImage) void postId;

      posts.push({ id: postId, userId: u.id, createdAt });
    }
  }

  return posts;
};

const seedComments = async (users: SeededUser[], posts: SeededPost[]) => {
  const db = await getDb();

  const commentTemplates = [
    'Love this.',
    'Big mood.',
    'This is oddly motivating.',
    'Agree 100%.',
    'Nice — thanks for sharing!',
    'That’s a good point.',
    'I needed to read this today.',
    'Wait, how did you do that?',
    '😂',
    'Solid update.',
  ];

  for (const p of posts) {
    const count = randInt(2, 8);

    for (let i = 0; i < count; i++) {
      const allowAuthor = Math.random() < 0.1;
      const commenter = allowAuthor ? users.find((u) => u.id === p.userId)! : pickOne(users.filter((u) => u.id !== p.userId));
      const createdAt = dateBetween(p.createdAt, new Date());

      await db.run(
        'INSERT INTO comments(post_id, user_id, text, created_at) VALUES (?, ?, ?, ?)',
        p.id,
        commenter.id,
        pickOne(commentTemplates),
        toSqliteDateTime(createdAt),
      );
    }
  }
};

const seedLikes = async (users: SeededUser[], posts: SeededPost[]) => {
  const db = await getDb();

  for (const u of users) {
    const pLike = randFloat(0.3, 0.7);
    for (const p of posts) {
      if (Math.random() > pLike) continue;
      const createdAt = dateBetween(p.createdAt, new Date());
      await db.run(
        'INSERT OR IGNORE INTO likes(user_id, post_id, created_at) VALUES (?, ?, ?)',
        u.id,
        p.id,
        toSqliteDateTime(createdAt),
      );
    }
  }

  await db.run('UPDATE posts SET like_count = (SELECT COUNT(*) FROM likes l WHERE l.post_id = posts.id)');
};

const seedFriendships = async (users: SeededUser[]) => {
  const db = await getDb();

  // Only create friendships among regular users (not admin) for more predictable density.
  const regular = users;

  const acceptedPairs: Array<{ a: SeededUser; b: SeededUser }> = [];

  for (let i = 0; i < regular.length; i++) {
    for (let j = i + 1; j < regular.length; j++) {
      if (Math.random() >= 0.3) continue;

      const a = regular[i]!;
      const b = regular[j]!;
      acceptedPairs.push({ a, b });

      const { user1, user2 } = normalizePair(a.id, b.id);
      const actionUserId = Math.random() < 0.5 ? a.id : b.id;
      const createdAt = toSqliteDateTime(dateWithinLastDays(30));

      await db.run(
        "INSERT OR IGNORE INTO friendships(user_id1, user_id2, status, action_user_id, created_at, updated_at) VALUES (?, ?, 'accepted', ?, ?, ?)",
        user1,
        user2,
        actionUserId,
        createdAt,
        createdAt,
      );

      // Add a lightweight notification so the Notifications page has content.
      const receiverId = actionUserId === a.id ? b.id : a.id;
      await createNotification({
        userId: receiverId,
        type: 'friend_request_accepted',
        actorUserId: actionUserId,
        entityType: 'user',
        entityId: actionUserId,
      });
    }
  }

  // Create a few pending requests so the UI can test friend-request notifications.
  const pairsSet = new Set(acceptedPairs.map(({ a, b }) => `${Math.min(a.id, b.id)}:${Math.max(a.id, b.id)}`));

  let pendingToCreate = 6;
  let guard = 0;
  while (pendingToCreate > 0 && guard++ < 500) {
    const a = pickOne(regular);
    const b = pickOne(regular.filter((u) => u.id !== a.id));
    const key = `${Math.min(a.id, b.id)}:${Math.max(a.id, b.id)}`;
    if (pairsSet.has(key)) continue;

    const { user1, user2 } = normalizePair(a.id, b.id);
    const senderId = a.id;
    const createdAt = toSqliteDateTime(dateWithinLastDays(7));

    const result = await db.run(
      "INSERT OR IGNORE INTO friendships(user_id1, user_id2, status, action_user_id, created_at, updated_at) VALUES (?, ?, 'pending', ?, ?, NULL)",
      user1,
      user2,
      senderId,
      createdAt,
    );

    if ((result.changes ?? 0) > 0) {
      const receiverId = b.id;
      await createNotification({
        userId: receiverId,
        type: 'friend_request_received',
        actorUserId: senderId,
        entityType: 'user',
        entityId: senderId,
      });
      pendingToCreate--;
    }
  }

  return acceptedPairs;
};

const seedChatGroups = async (admin: SeededUser, users: SeededUser[]) => {
  const db = await getDb();

  const groups: SeededGroup[] = [];

  const publicNames = ['General', 'Campus Chat', 'Project Ideas', 'Memes'];
  const privateNames = ['Study Group', 'Team Lounge'];

  for (const name of publicNames) {
    const createdBy = pickOne([admin, ...users]);
    const createdAt = toSqliteDateTime(dateWithinLastDays(30));

    const result = await db.run(
      'INSERT INTO chat_groups(name, description, is_private, created_by, created_at) VALUES (?, ?, 0, ?, ?)',
      name,
      `${name} room for seeded test data.`,
      createdBy.id,
      createdAt,
    );

    const groupId = result.lastID as number;

    const memberCount = randInt(3, Math.min(8, users.length + 1));
    const members = pickSomeUnique([admin, ...users], memberCount);

    // Ensure creator and admin are members.
    const memberIds = Array.from(new Set([admin.id, createdBy.id, ...members.map((m) => m.id)]));

    for (const uid of memberIds) {
      const role = uid === createdBy.id ? 'admin' : 'member';
      await db.run(
        'INSERT OR IGNORE INTO chat_group_members(group_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)',
        groupId,
        uid,
        role,
        createdAt,
      );
    }

    groups.push({ id: groupId, isPrivate: false, memberIds });
  }

  for (const name of privateNames) {
    const createdBy = pickOne([admin, ...users]);
    const createdAt = toSqliteDateTime(dateWithinLastDays(30));

    const result = await db.run(
      'INSERT INTO chat_groups(name, description, is_private, created_by, created_at) VALUES (?, ?, 1, ?, ?)',
      name,
      `${name} (private) room for seeded test data.`,
      createdBy.id,
      createdAt,
    );

    const groupId = result.lastID as number;

    const memberCount = randInt(3, Math.min(7, users.length + 1));
    const members = pickSomeUnique([admin, ...users], memberCount);

    const memberIds = Array.from(new Set([admin.id, createdBy.id, ...members.map((m) => m.id)]));

    for (const uid of memberIds) {
      const role = uid === createdBy.id ? 'admin' : 'member';
      await db.run(
        'INSERT OR IGNORE INTO chat_group_members(group_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)',
        groupId,
        uid,
        role,
        createdAt,
      );
    }

    // Create a couple of invites for users who are NOT members to populate the invites UI.
    const nonMembers = [admin, ...users].filter((u) => !memberIds.includes(u.id));
    const invitees = pickSomeUnique(nonMembers, Math.min(2, nonMembers.length));
    for (const invitee of invitees) {
      await db.run(
        'INSERT OR IGNORE INTO chat_group_invites(group_id, invited_user_id, invited_by_user_id, created_at) VALUES (?, ?, ?, ?)',
        groupId,
        invitee.id,
        createdBy.id,
        toSqliteDateTime(dateWithinLastDays(7)),
      );
    }

    groups.push({ id: groupId, isPrivate: true, memberIds });
  }

  return groups;
};

const seedChatMessages = async (groups: SeededGroup[]) => {
  const db = await getDb();

  const textTemplates = [
    'Hey everyone!',
    'Anyone around?',
    'That makes sense.',
    'Quick question: does this work on your end?',
    'I’ll take a look in a bit.',
    'Nice work!',
    'Let’s keep it simple.',
    'Dropping an image:',
    'lol',
    '✅',
  ];

  for (const g of groups) {
    const messageCount = randInt(10, 50);
    const now = new Date();

    const insertedMessageIds: number[] = [];

    for (let i = 0; i < messageCount; i++) {
      const senderId = pickOne(g.memberIds);
      const createdAt = dateWithinLastDays(7);
      const isImage = false;

      const result = await db.run(
        'INSERT INTO chat_messages(group_id, user_id, type, text, image_url, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        g.id,
        senderId,
        isImage ? 'image' : 'text',
        isImage ? null : pickOne(textTemplates),
        null,
        toSqliteDateTime(dateBetween(createdAt, now)),
      );

      insertedMessageIds.push(result.lastID as number);
    }

    // Create a small number of message notifications for the last few messages,
    // so the Notifications inbox has realistic content without exploding in size.
    const lastIds = insertedMessageIds.slice(-3);
    for (const _msgId of lastIds) {
      const senderId = pickOne(g.memberIds);
      const recipients = pickSomeUnique(g.memberIds.filter((id) => id !== senderId), Math.min(3, g.memberIds.length - 1));
      for (const r of recipients) {
        await createNotification({
          userId: r,
          type: 'message_received',
          actorUserId: senderId,
          entityType: 'chat_group',
          entityId: g.id,
        });
      }
    }
  }
};

const seedDmThreads = async (admin: SeededUser, users: SeededUser[]) => {
  const db = await getDb();

  const eligiblePairs = FRIENDS_ONLY_DM
    ? await db.all<{ user_id1: number; user_id2: number }[]>("SELECT user_id1, user_id2 FROM friendships WHERE status = 'accepted'")
    : (() => {
        const ids = [admin.id, ...users.map((u) => u.id)];
        const pairs: Array<{ user_id1: number; user_id2: number }> = [];
        for (let i = 0; i < ids.length; i++) {
          for (let j = i + 1; j < ids.length; j++) pairs.push({ user_id1: ids[i]!, user_id2: ids[j]! });
        }
        return pairs;
      })();

  if (eligiblePairs.length === 0) {
    console.log('No eligible DM pairs found (likely FRIENDS_ONLY_DM=true and no friendships). Skipping DM seeding.');
    return;
  }

  const pairs = pickSomeUnique(eligiblePairs, Math.min(8, eligiblePairs.length));

  const messageTemplates = [
    'hey',
    'what’s up?',
    'did you see the new post?',
    'lol true',
    'I’ll reply later',
    'nice',
    'send me the link',
  ];

  for (const pair of pairs) {
    const { user1, user2 } = normalizePair(pair.user_id1, pair.user_id2);

    // Check if thread already exists.
    const existing = await db.get<{ group_id: number }>(
      'SELECT group_id FROM chat_direct_threads WHERE user_low_id = ? AND user_high_id = ?',
      user1,
      user2,
    );

    let groupId: number;

    if (existing) {
      groupId = existing.group_id;
    } else {
      const createdAt = toSqliteDateTime(dateWithinLastDays(30));
      const groupRes = await db.run(
        'INSERT INTO chat_groups(name, description, is_private, created_by, created_at) VALUES (?, ?, 1, ?, ?)',
        'DM',
        null,
        user1,
        createdAt,
      );

      groupId = groupRes.lastID as number;

      await db.run('INSERT INTO chat_direct_threads(user_low_id, user_high_id, group_id, created_at) VALUES (?, ?, ?, ?)', user1, user2, groupId, createdAt);

      await db.run('INSERT OR IGNORE INTO chat_group_members(group_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)', groupId, user1, 'member', createdAt);
      await db.run('INSERT OR IGNORE INTO chat_group_members(group_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)', groupId, user2, 'member', createdAt);
    }

    const messageCount = randInt(5, 20);
    const members = [user1, user2];

    for (let i = 0; i < messageCount; i++) {
      const sender = pickOne(members);
      const isImage = false;
      const createdAt = toSqliteDateTime(dateWithinLastDays(7));
      await db.run(
        'INSERT INTO chat_messages(group_id, user_id, type, text, image_url, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        groupId,
        sender,
        isImage ? 'image' : 'text',
        isImage ? null : pickOne(messageTemplates),
        null,
        createdAt,
      );
    }

    // Create a couple message notifications for the other user.
    const sender = pickOne(members);
    const receiver = sender === user1 ? user2 : user1;
    await createNotification({
      userId: receiver,
      type: 'message_received',
      actorUserId: sender,
      entityType: 'chat_group',
      entityId: groupId,
    });
  }
};

const main = async () => {
  const { force } = parseArgs(process.argv.slice(2));

  console.log('Running migrations...');
  await runMigrations();

  // For demo repos, always reset and reseed by default.
  await resetAllData(force);

  console.log('Creating users...');
  const admin = await seedAdmin();
  const regularUsers = await seedRegularUsers();

  console.log('Creating friendships...');
  await seedFriendships(regularUsers);

  console.log('Creating posts...');
  const posts = await seedPosts(regularUsers);

  console.log('Creating comments...');
  await seedComments(regularUsers, posts);

  console.log('Creating likes...');
  await seedLikes(regularUsers, posts);

  console.log('Creating chat groups...');
  const groups = await seedChatGroups(admin, regularUsers);

  console.log('Creating chat messages...');
  await seedChatMessages(groups);

  console.log(`Creating DM threads... (FRIENDS_ONLY_DM=${FRIENDS_ONLY_DM})`);
  await seedDmThreads(admin, regularUsers);

  console.log('Done seeding test data.');
  console.log('Accounts:');
  console.log('  - admin / admin123');
  console.log('  - seed_user01..seed_user10 / password123');
};

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
