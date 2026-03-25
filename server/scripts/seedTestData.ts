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

import { rm } from 'node:fs/promises';
import path from 'node:path';
import { runMigrations } from '../src/db/migrate.js';
import { getDb } from '../src/db/sqlite.js';
import { hashPassword } from '../src/auth/passwords.js';
import { createNotification } from '../src/services/notifications.js';
import { lookupLocation } from '../src/services/location.js';
import { config } from '../src/config.js';
import type { PostCategory } from '../src/social/categories.js';

type SeedUserInput = {
  username: string;
  password: string;
  displayName: string;
  bio: string;
  statusText: string;
  avatarUrl: string | null;
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
  status: 'draft' | 'scheduled' | 'published';
};

type SeededComment = {
  id: number;
  postId: number;
  userId: number;
  createdAt: Date;
};

type SeedPostTemplate = {
  text: string;
  visibility: 'public' | 'friends';
  category: PostCategory;
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

const hoursAgo = (hours: number): Date => new Date(Date.now() - hours * 60 * 60 * 1000);

const imageKeywordsForCategory: Record<PostCategory, string> = {
  all: 'lifestyle,people',
  food: 'food,restaurant',
  studies: 'study,library',
  jobs: 'office,work',
  travel: 'travel,landscape',
  others: 'street,city',
};

const imageUrlForCategory = (category: PostCategory, sequence: number): string => {
  const keywords = imageKeywordsForCategory[category];
  const lock = 1000 + sequence;
  return `https://loremflickr.com/1200/800/${keywords}?lock=${lock}`;
};

const normalizePair = (a: number, b: number) => (a < b ? { user1: a, user2: b } : { user1: b, user2: a });

const seedIps = [
  '127.0.0.1',
  '203.0.113.21',
  '198.51.100.34',
  '203.0.113.88',
  '198.51.100.109',
  '203.0.113.144',
  '198.51.100.171',
  '203.0.113.203',
  '198.51.100.230',
  '203.0.113.245',
] as const;

const networkForUserIndex = (userIndex: number) => {
  const ip = seedIps[userIndex % seedIps.length]!;
  const location = lookupLocation(ip);
  return {
    ip,
    country: location.country,
    region: location.region,
    city: location.city,
  };
};

const resetDatabaseFile = async (force: boolean) => {
  if (!force || config.sqlitePath === ':memory:') return;
  console.log('Resetting database (force)...');
  await rm(path.resolve(config.sqlitePath), { force: true });
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
      avatarUrl: 'https://i.pravatar.cc/300?img=11',
    },
    {
      password: 'password123',
      displayName: 'Noah Patel',
      bio: 'I build small apps and overthink UX.',
      statusText: 'Shipping small wins.',
      avatarUrl: null,
    },
    {
      password: 'password123',
      displayName: 'Mia Rodriguez',
      bio: 'Book notes, messy sketches, and good ramen spots.',
      statusText: 'Reading something interesting.',
      avatarUrl: 'https://i.pravatar.cc/300?img=32',
    },
    {
      password: 'password123',
      displayName: 'Liam Wong',
      bio: 'Gym, games, and the occasional spicy take.',
      statusText: 'Leg day survived.',
      avatarUrl: null,
    },
    {
      password: 'password123',
      displayName: 'Sophia Kim',
      bio: 'Trying to cook. Mostly failing. Still optimistic.',
      statusText: 'Testing recipes.',
      avatarUrl: 'https://i.pravatar.cc/300?img=5',
    },
    {
      password: 'password123',
      displayName: 'Ethan Nguyen',
      bio: 'Minimalist. Notes app power user.',
      statusText: 'Clean desk, clear mind.',
      avatarUrl: 'https://i.pravatar.cc/300?img=15',
    },
    {
      password: 'password123',
      displayName: 'Isabella Rossi',
      bio: 'City walks and tiny moments.',
      statusText: 'Golden hour soon.',
      avatarUrl: null,
    },
    {
      password: 'password123',
      displayName: 'Lucas Silva',
      bio: 'Learning, iterating, repeating.',
      statusText: 'Debugging life.',
      avatarUrl: 'https://i.pravatar.cc/300?img=22',
    },
    {
      password: 'password123',
      displayName: 'Amelia Johnson',
      bio: 'Plants, playlists, and project ideas.',
      statusText: 'New leaf day.',
      avatarUrl: null,
    },
    {
      password: 'password123',
      displayName: 'Oliver Brown',
      bio: 'Sports, snacks, and bad jokes.',
      statusText: 'On a snack run.',
      avatarUrl: 'https://i.pravatar.cc/300?img=53',
    },
  ];

  const out: SeededUser[] = [];

  for (let i = 0; i < base.length; i++) {
    const username = `seed_user${pad2(i + 1)}`;
    const existing = await db.get<{ id: number }>('SELECT id FROM users WHERE username = ?', username);
    if (existing) {
      await db.run(
        'UPDATE users SET display_name = ?, bio = ?, status_text = ?, avatar_url = ? WHERE id = ?',
        base[i]!.displayName,
        base[i]!.bio,
        base[i]!.statusText,
        base[i]!.avatarUrl,
        existing.id,
      );
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
      base[i]!.avatarUrl,
      createdAt,
    );

    const id = result.lastID as number;
    out.push({ id, username, role: 'user' });
  }

  return out;
};

const seedPosts = async (users: SeededUser[]): Promise<SeededPost[]> => {
  const db = await getDb();

  const postTemplates: SeedPostTemplate[] = [
    {
      text: 'Lunch break reset. Found a cozy place with great noodles and quiet lighting.',
      visibility: 'public',
      category: 'food',
    },
    {
      text: 'Library sprint done. Sharing my study setup for this week.',
      visibility: 'friends',
      category: 'studies',
    },
    {
      text: 'Career update: wrapped a mock interview session and wrote down key takeaways.',
      visibility: 'public',
      category: 'jobs',
    },
    {
      text: 'Weekend travel moodboard. This view made the entire day.',
      visibility: 'public',
      category: 'travel',
    },
    {
      text: 'General life dump: balancing projects, rest, and keeping momentum.',
      visibility: 'friends',
      category: 'all',
    },
    {
      text: 'Random share from today. Not a big moment, just a good one.',
      visibility: 'public',
      category: 'others',
    },
  ];

  const posts: SeededPost[] = [];

  for (let userIndex = 0; userIndex < users.length; userIndex++) {
    const u = users[userIndex]!;
    const postsPerUser = 4;
    for (let i = 0; i < postsPerUser; i++) {
      const sequence = userIndex * postsPerUser + i;
      const template = postTemplates[(userIndex * postsPerUser + i) % postTemplates.length]!;
      const hoursOffset = userIndex * postsPerUser * 3 + i * 3 + 2;
      const createdAt = hoursAgo(hoursOffset);
      const category = template.category;
      const hasImage = sequence % 3 !== 1;
      const imageUrl = hasImage ? imageUrlForCategory(category, sequence) : null;
      const network = networkForUserIndex(userIndex);
      const status = i === postsPerUser - 1 ? (userIndex % 2 === 0 ? 'draft' : 'scheduled') : 'published';
      const publishedAt = status === 'published' ? createdAt : null;
      const scheduledPublishAt = status === 'scheduled' ? new Date(Date.now() + (userIndex + 6) * 60 * 60 * 1000) : null;
      const draftSavedAt = status === 'draft' ? new Date(createdAt.getTime() + 20 * 60 * 1000) : null;
      const result = await db.run(
        `INSERT INTO posts(
          user_id, text, image_url, visibility, category, status, scheduled_publish_at, published_at, draft_saved_at,
          like_count, view_count, collect_count,
          author_ip, author_country, author_region, author_city,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, ?, ?, NULL)`,
        u.id,
        template.text,
        imageUrl,
        template.visibility,
        category,
        status,
        scheduledPublishAt ? toSqliteDateTime(scheduledPublishAt) : null,
        publishedAt ? toSqliteDateTime(publishedAt) : null,
        draftSavedAt ? toSqliteDateTime(draftSavedAt) : null,
        network.ip,
        network.country,
        network.region,
        network.city,
        toSqliteDateTime(createdAt),
      );

      const postId = result.lastID as number;
      posts.push({ id: postId, userId: u.id, createdAt, status });
    }
  }

  return posts;
};

const seedComments = async (users: SeededUser[], posts: SeededPost[]): Promise<SeededComment[]> => {
  const db = await getDb();
  const comments: SeededComment[] = [];

  for (let postIndex = 0; postIndex < posts.length; postIndex++) {
    const p = posts[postIndex]!;
    if (p.status !== 'published') continue;

    const ownerIndex = users.findIndex((u) => u.id === p.userId);
    const participants = users.filter((u) => u.id !== p.userId);
    const owner = ownerIndex >= 0 ? users[ownerIndex]! : participants[0]!;
    const firstCommenter = participants[postIndex % participants.length]!;
    const secondCommenter = participants[(postIndex + 1) % participants.length]!;
    const thirdCommenter = participants[(postIndex + 2) % participants.length]!;

    const commentPlan = [
      {
        commenter: firstCommenter,
        parentCommentId: null,
        text: 'This looks great. Where did you take this?',
        mentionUser: null,
      },
      {
        commenter: secondCommenter,
        parentCommentId: null,
        text: `@${owner.username} this is a strong update. I saved a few ideas from it.`,
        mentionUser: owner,
      },
      {
        commenter: owner,
        parentCommentId: 'first',
        text: `@${firstCommenter.username} Thanks. I can share more details later today.`,
        mentionUser: firstCommenter,
      },
      {
        commenter: thirdCommenter,
        parentCommentId: 'second',
        text: `@${secondCommenter.username} Same here. The image and note combo works really well.`,
        mentionUser: secondCommenter,
      },
    ] as const;

    let firstCommentId: number | null = null;
    let secondCommentId: number | null = null;

    for (let i = 0; i < commentPlan.length; i++) {
      const plan = commentPlan[i]!;
      const createdAt = new Date(p.createdAt.getTime() + (i + 1) * 35 * 60 * 1000);
      const commenterIndex = users.findIndex((u) => u.id === plan.commenter.id);
      const network = networkForUserIndex(Math.max(commenterIndex, 0));
      const parentCommentId =
        plan.parentCommentId === 'first'
          ? firstCommentId
          : plan.parentCommentId === 'second'
            ? secondCommentId
            : null;

      const result = await db.run(
        `INSERT INTO comments(
          post_id, user_id, parent_comment_id, text, like_count, collect_count,
          author_ip, author_country, author_region, author_city, created_at
        ) VALUES (?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?)`,
        p.id,
        plan.commenter.id,
        parentCommentId,
        plan.text,
        network.ip,
        network.country,
        network.region,
        network.city,
        toSqliteDateTime(createdAt),
      );

      const commentId = result.lastID as number;
      comments.push({ id: commentId, postId: p.id, userId: plan.commenter.id, createdAt });

      if (i === 0) firstCommentId = commentId;
      if (i === 1) secondCommentId = commentId;

    }
  }

  return comments;
};

const seedLikes = async (users: SeededUser[], posts: SeededPost[]) => {
  const db = await getDb();

  for (const u of users) {
    const pLike = randFloat(0.3, 0.7);
    for (const p of posts) {
      if (p.status !== 'published') continue;
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

const seedPostCollections = async (users: SeededUser[], posts: SeededPost[]) => {
  const db = await getDb();

  for (const user of users) {
    const pCollect = randFloat(0.18, 0.42);
    for (const post of posts) {
      if (post.status !== 'published' || post.userId === user.id || Math.random() > pCollect) continue;
      const createdAt = dateBetween(post.createdAt, new Date());
      await db.run(
        'INSERT OR IGNORE INTO post_collections(user_id, post_id, created_at) VALUES (?, ?, ?)',
        user.id,
        post.id,
        toSqliteDateTime(createdAt),
      );
    }
  }

  await db.run('UPDATE posts SET collect_count = (SELECT COUNT(*) FROM post_collections pc WHERE pc.post_id = posts.id)');
};

const seedPostViews = async (users: SeededUser[], posts: SeededPost[]) => {
  const db = await getDb();

  for (const post of posts) {
    if (post.status !== 'published') continue;

    const viewCount = randInt(6, 18);
    for (let i = 0; i < viewCount; i++) {
      const maybeViewer = Math.random() < 0.72 ? pickOne(users) : null;
      const createdAt = dateBetween(post.createdAt, new Date());
      await db.run(
        'INSERT INTO post_views(post_id, viewer_user_id, viewer_session, created_at) VALUES (?, ?, ?, ?)',
        post.id,
        maybeViewer?.id ?? null,
        // Anonymous demo views do not have a persisted session row.
        null,
        toSqliteDateTime(createdAt),
      );
    }
  }

  await db.run('UPDATE posts SET view_count = (SELECT COUNT(*) FROM post_views pv WHERE pv.post_id = posts.id)');
};

const seedCommentInteractions = async (users: SeededUser[], comments: SeededComment[]) => {
  const db = await getDb();

  for (const comment of comments) {
    for (const user of users) {
      if (user.id === comment.userId) continue;

      if (Math.random() < 0.38) {
        const createdAt = dateBetween(comment.createdAt, new Date());
        await db.run(
          'INSERT OR IGNORE INTO comment_likes(user_id, comment_id, created_at) VALUES (?, ?, ?)',
          user.id,
          comment.id,
          toSqliteDateTime(createdAt),
        );
      }

      if (Math.random() < 0.16) {
        const createdAt = dateBetween(comment.createdAt, new Date());
        await db.run(
          'INSERT OR IGNORE INTO comment_collections(user_id, comment_id, created_at) VALUES (?, ?, ?)',
          user.id,
          comment.id,
          toSqliteDateTime(createdAt),
        );
      }
    }
  }

  await db.run('UPDATE comments SET like_count = (SELECT COUNT(*) FROM comment_likes cl WHERE cl.comment_id = comments.id)');
  await db.run('UPDATE comments SET collect_count = (SELECT COUNT(*) FROM comment_collections cc WHERE cc.comment_id = comments.id)');
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

const main = async () => {
  const { force } = parseArgs(process.argv.slice(2));

  await resetDatabaseFile(force);

  console.log('Initializing schema...');
  await runMigrations();

  console.log('Creating users...');
  const admin = await seedAdmin();
  const regularUsers = await seedRegularUsers();

  console.log('Creating friendships...');
  await seedFriendships(regularUsers);

  console.log('Creating posts...');
  const posts = await seedPosts(regularUsers);

  console.log('Creating comments...');
  const comments = await seedComments(regularUsers, posts);

  console.log('Creating likes...');
  await seedLikes(regularUsers, posts);

  console.log('Creating collections...');
  await seedPostCollections(regularUsers, posts);

  console.log('Creating post views...');
  await seedPostViews(regularUsers, posts);

  console.log('Creating comment interactions...');
  await seedCommentInteractions(regularUsers, comments);

  console.log('Done seeding test data.');
  console.log('Accounts:');
  console.log('  - admin / admin123');
  console.log('  - seed_user01..seed_user10 / password123');
};

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
