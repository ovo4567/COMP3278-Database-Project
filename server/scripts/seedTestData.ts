/**
 * Seed a fixed demo dataset into the SQLite database.
 *
 * Run:
 *   - From repo root:   npm -w server run seed:test
 *   - Or directly:     npx tsx server/scripts/seedTestData.ts
 *
 * Seed once to create the fixed demo dataset.
 * Rebuild from scratch only when needed:
 *   npm -w server run seed:test -- --force
 */

import path from 'node:path';
import { runMigrations } from '../src/db/migrate.js';
import { getDb } from '../src/db/sqlite.js';
import { hashPassword } from '../src/auth/passwords.js';
import { createNotification } from '../src/services/notifications.js';
import { config } from '../src/config.js';
import type { PostCategory } from '../src/social/categories.js';

const demoNow = new Date();

type SeedUserInput = {
  username: string;
  password: string;
  displayName: string;
  bio: string;
  statusText: string;
  avatarUrl: string | null;
};

type SeededUser = {
  id: string;
  username: string;
  role: 'user' | 'admin';
};

type SeededPost = {
  id: number;
  userId: string;
  createdAt: Date;
  status: 'draft' | 'scheduled' | 'published';
  category: PostCategory;
};

type SeededComment = {
  id: number;
  postId: number;
  userId: string;
  createdAt: Date;
};

type PostFragments = {
  subjects: string[];
};

type CommentFragments = {
  openers: string[];
};

const fillTemplate = (template: string, replacements: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => replacements[key] ?? '');

const parseArgs = (argv: string[]) => {
  const force = argv.includes('--force');
  return { force };
};

const pad2 = (n: number) => String(n).padStart(2, '0');

const randInt = (minInclusive: number, maxInclusive: number): number => {
  const min = Math.ceil(minInclusive);
  const max = Math.floor(maxInclusive);
  return min + Math.floor((max - min) / 2);
};

const randFloat = (minInclusive: number, maxInclusive: number): number => {
  return (minInclusive + maxInclusive) / 2;
};

const pickOne = <T>(arr: T[]): T => {
  if (arr.length === 0) throw new Error('pickOne: empty array');
  return arr[Math.floor(arr.length / 2)]!;
};

const pickBySequence = <T>(items: T[], index: number, rotation: number, step: number): T => {
  if (items.length === 0) throw new Error('pickBySequence: empty array');
  return items[(rotation + index * step) % items.length]!;
};

const daysAgo = (days: number, extraHours = 0, extraMinutes = 0): Date =>
  new Date(demoNow.getTime() - (((days * 24 + extraHours) * 60 + extraMinutes) * 60 * 1000));

const timeBetween = (start: Date, end: Date, numerator: number, denominator: number): Date => {
  if (denominator <= 0) return new Date(start.getTime());
  const clamped = Math.max(0, Math.min(numerator, denominator));
  const span = end.getTime() - start.getTime();
  return new Date(start.getTime() + Math.floor((span * clamped) / denominator));
};

const toSqliteDateTime = (d: Date): string => {
  // SQLite's datetime('now') yields "YYYY-MM-DD HH:MM:SS".
  // Using this format keeps ordering and date()/datetime() queries predictable.
  return d.toISOString().slice(0, 19).replace('T', ' ');
};

const dateWithinLastDays = (days: number): Date => {
  return daysAgo(days);
};

const dateBetween = (start: Date, end: Date): Date => {
  return new Date(Math.floor((start.getTime() + end.getTime()) / 2));
};

const hoursAgo = (hours: number): Date => new Date(demoNow.getTime() - hours * 60 * 60 * 1000);

const imageUrlForCategory = (category: PostCategory, sequence: number): string => {
  const seed = `comp3278-${category}-${pad2(sequence + 1)}`;
  return `https://picsum.photos/seed/${seed}/1200/800`;
};

const postFragmentsByCategory: Record<PostCategory, PostFragments> = {
  all: {
    subjects: [
      'Quick reset from today',
      'Small check-in',
      'Day recap',
      'Low-key win',
      'Midday pause',
      'Evening note',
      'Tiny update',
      'Nothing dramatic',
    ],
  },
  food: {
    subjects: [
      'Lunch break update',
      'Dinner experiment',
      'Recipe note',
      'Snack stop',
      'Kitchen win',
      'Plate of the day',
      'Coffee break reset',
      'Weekend bite',
    ],
  },
  jobs: {
    subjects: [
      'Career note',
      'Interview prep',
      'Portfolio pass',
      'Resume cleanup',
      'Application update',
      'Work note',
      'Feedback round',
      'Skill-building session',
    ],
  },
  others: {
    subjects: [
      'Side project note',
      'Creative experiment',
      'Random idea',
      'Tiny build log',
      'Weekend curiosity',
      'Playground update',
      'Trying something new',
      'Loose sketch',
    ],
  },
  studies: {
    subjects: [
      'Study block',
      'Reading sprint',
      'Notes cleanup',
      'Revision pass',
      'Library reset',
      'Focus session',
      'Assignment check-in',
      'Learning note',
    ],
  },
  travel: {
    subjects: [
      'Travel note',
      'Train-window moment',
      'Route change',
      'Weekend detour',
      'City walk',
      'View from the seat',
      'Short trip reset',
      'On the move',
    ],
  },
};

const postActions = [
  'I spent a little extra time on',
  'I started with',
  'I finished',
  'I cleaned up',
  'I tried',
  'I came back to',
  'I made room for',
  'I followed up on',
];

const postDetails = [
  'one small thing that had been hanging around.',
  'a calmer version of the plan.',
  'the part that actually moves things forward.',
  'something I had been putting off.',
  'a better rhythm for the rest of the day.',
  'a note to myself for tomorrow.',
  'the simplest path instead of the loudest one.',
  'the detail I kept skipping before.',
];

const postClosers = [
  'It felt like progress without the noise.',
  'Good enough for a demo day.',
  'Small wins still count.',
  'That was the useful part.',
  'I will take that.',
  'Nothing flashy, just steady.',
  'It made the day smoother.',
  'Worth keeping.',
];

const commentOpenersByCategory: Record<PostCategory, CommentFragments> = {
  all: {
    openers: [
      'This feels like a grounded update.',
      'I like how natural this comes across.',
      'That is the kind of post people actually respond to.',
      'This has a nice steady tone.',
      'There is a good amount of detail here.',
      'I can follow the point without extra context.',
      'This reads like a real day, which I appreciate.',
      'The balance here is working well.',
    ],
  },
  food: {
    openers: [
      'That looks genuinely good.',
      'Now I am hungry again.',
      'This is strong lunch energy.',
      'The plating makes it look even better.',
      'I would absolutely try this.',
      'That sounds like a very solid meal.',
      'This is the kind of food post that wins the feed.',
      'I can almost taste this from here.',
    ],
  },
  jobs: {
    openers: [
      'This is a useful career check-in.',
      'I like the practical angle here.',
      'That kind of note is genuinely helpful.',
      'This feels like real progress.',
      'The update is clear without being too much.',
      'I would save this for later.',
      'There is a lot of useful detail in here.',
      'This is the kind of work note that pays off.',
    ],
  },
  others: {
    openers: [
      'This is exactly the sort of experiment I like seeing.',
      'There is a nice curiosity in this one.',
      'I appreciate the low-pressure energy here.',
      'This feels playful in a good way.',
      'The idea comes through clearly.',
      'This is the kind of side project that gets interesting fast.',
      'I like the rough edges on this.',
      'It is cool to see an idea in motion.',
    ],
  },
  studies: {
    openers: [
      'This study setup feels calm and usable.',
      'I like how organized this looks.',
      'That is a pretty clean focus block.',
      'This makes the work feel manageable.',
      'There is some nice structure here.',
      'This is the kind of note that actually helps later.',
      'The rhythm here looks strong.',
      'I can tell the planning paid off.',
    ],
  },
  travel: {
    openers: [
      'This looks like a reset in the best way.',
      'That view is doing a lot of work here.',
      'I like the slow pace of this update.',
      'This has real travel mood.',
      'It feels good just reading this one.',
      'That is the kind of detour people remember.',
      'This makes me want a window seat.',
      'The calm tone fits the trip really well.',
    ],
  },
};

const commentSupportLines = [
  '@{owner} Nice balance between detail and brevity.',
  '@{owner} This actually feels practical.',
  '@{owner} The framing makes it easy to follow.',
  '@{owner} You made the update sound effortless.',
  '@{owner} The pacing here is really good.',
  '@{owner} I can see why this stood out.',
  '@{owner} Solid call to share it.',
  '@{owner} There is enough detail to be useful without overdoing it.',
];

const commentOwnerReplies = [
  '@{first} Glad it landed that way.',
  '@{first} That was the goal.',
  '@{first} I was hoping it would read clearly.',
  '@{first} Appreciate the feedback.',
  '@{first} I tried to keep it simple.',
  '@{first} That helps a lot.',
  '@{first} I am still refining it.',
  '@{first} Nice to hear.',
];

const commentFollowUps = [
  '@{second} The extra context helps a lot.',
  '@{second} That detail makes it even better.',
  '@{second} I am with you on that.',
  '@{second} It works because it stays focused.',
  '@{second} The smaller scope is probably why it reads well.',
  '@{second} This feels easy to come back to later.',
  '@{second} Exactly the kind of thing that sticks.',
  '@{second} I would save this too.',
];

const postCategoryOrder: PostCategory[] = ['all', 'food', 'studies', 'jobs', 'travel', 'others'];

const postVisibilityByCategory: Record<PostCategory, Array<'public' | 'friends'>> = {
  all: ['public', 'friends', 'public', 'public'],
  food: ['public', 'public', 'friends', 'public'],
  jobs: ['public', 'friends', 'public', 'public'],
  others: ['friends', 'public', 'public', 'friends'],
  studies: ['public', 'friends', 'public', 'friends'],
  travel: ['public', 'friends', 'public', 'public'],
};

const buildPostText = (category: PostCategory, userIndex: number, sequence: number, slot: number): string => {
  const subject = pickBySequence(postFragmentsByCategory[category].subjects, sequence, userIndex + slot, 3);
  const action = pickBySequence(postActions, sequence + userIndex, slot, 5);
  const detail = pickBySequence(postDetails, sequence + slot, userIndex, 7);
  const closer = pickBySequence(postClosers, sequence + userIndex * 2, slot, 11);
  return `${subject}: ${action} ${detail} ${closer}`;
};

const normalizePair = (a: string, b: string) => (a < b ? { user1: a, user2: b } : { user1: b, user2: a });

const resetDatabaseInPlace = async (force: boolean) => {
  if (!force) return;

  console.log('Resetting database (force)...');
  const db = await getDb();
  await db.exec('PRAGMA foreign_keys = OFF;');
  try {
    await db.exec(`
      DROP VIEW IF EXISTS post_engagement;
      DROP TABLE IF EXISTS notifications;
      DROP TABLE IF EXISTS post_collections;
      DROP TABLE IF EXISTS likes;
      DROP TABLE IF EXISTS comments;
      DROP TABLE IF EXISTS posts;
      DROP TABLE IF EXISTS friendships;
      DROP TABLE IF EXISTS users;
      DROP TABLE IF EXISTS comment_likes;
      DROP TABLE IF EXISTS comment_collections;
      DROP TABLE IF EXISTS post_views;
      DROP TABLE IF EXISTS sessions;
    `);
  } finally {
    await db.exec('PRAGMA foreign_keys = ON;');
  }
};

const seedAdmin = async (): Promise<SeededUser> => {
  const db = await getDb();

  const adminUsername = 'admin';
  const adminPassword = 'admin123';

  const existing = await db.get<{ username: string; role: 'user' | 'admin' }>('SELECT username, role FROM users WHERE username = ?', adminUsername);
  if (existing) {
    if (existing.role !== 'admin') {
      await db.run("UPDATE users SET role = 'admin' WHERE username = ?", existing.username);
    }

    // Ensure admin has profile fields filled.
    await db.run(
      'UPDATE users SET display_name = COALESCE(display_name, ?), bio = COALESCE(bio, ?), status_text = COALESCE(status_text, ?) WHERE username = ?',
      'Admin',
      'Administrator account for testing the admin dashboard.',
      'Keeping an eye on things.',
      existing.username,
    );

    // Demo seed should not rely on external image hosts.
    await db.run('UPDATE users SET avatar_url = NULL WHERE username = ?', existing.username);

    console.log(`Admin exists: @${adminUsername}`);
    return { id: existing.username, username: adminUsername, role: 'admin' };
  }

  const passwordHash = await hashPassword(adminPassword);
  const createdAt = toSqliteDateTime(daysAgo(480, 3));

  await db.run(
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

  await db.run('UPDATE users SET avatar_url = NULL WHERE username = ?', adminUsername);

  console.log(`Created admin: @${adminUsername} (password: ${adminPassword})`);
  return { id: adminUsername, username: adminUsername, role: 'admin' };
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
    const existing = await db.get<{ username: string }>('SELECT username FROM users WHERE username = ?', username);
    if (existing) {
      await db.run(
        'UPDATE users SET display_name = ?, bio = ?, status_text = ?, avatar_url = ? WHERE username = ?',
        base[i]!.displayName,
        base[i]!.bio,
        base[i]!.statusText,
        base[i]!.avatarUrl,
        existing.username,
      );
      out.push({ id: username, username, role: 'user' });
      continue;
    }

    const createdAt = toSqliteDateTime(daysAgo(320 - i * 11, i % 5, i * 4));
    const passwordHash = await hashPassword(base[i]!.password);

    await db.run(
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

    out.push({ id: username, username, role: 'user' });
  }

  return out;
};

const seedPosts = async (users: SeededUser[]): Promise<SeededPost[]> => {
  const db = await getDb();

  const posts: SeededPost[] = [];
  const specialAges: Record<string, number> = {
    '0:0': 365,
    '1:0': 30,
    '2:0': 7,
  };
  const specialCategories: Record<string, PostCategory> = {
    '0:0': 'travel',
    '1:0': 'studies',
    '2:0': 'jobs',
  };

  for (let userIndex = 0; userIndex < users.length; userIndex++) {
    const u = users[userIndex]!;
    const postsPerUser = 4;
    for (let i = 0; i < postsPerUser; i++) {
      const sequence = userIndex * postsPerUser + i;
      const key = `${userIndex}:${i}`;
      const category = specialCategories[key] ?? postCategoryOrder[sequence % postCategoryOrder.length]!;
      const visibilityOptions = postVisibilityByCategory[category];
      const visibility = visibilityOptions[(userIndex + i) % visibilityOptions.length]!;
      const text = buildPostText(category, userIndex, sequence, i);
      const createdAt = specialAges[key] !== undefined ? daysAgo(specialAges[key]!) : hoursAgo(userIndex * postsPerUser * 3 + i * 3 + 2);
      const hasImage = sequence % 3 !== 1;
      const imageUrl = hasImage ? imageUrlForCategory(category, sequence) : null;
      const status = i === postsPerUser - 1 ? (userIndex % 2 === 0 ? 'draft' : 'scheduled') : 'published';
      const publishedAt = status === 'published' ? createdAt : null;
      const scheduledPublishAt = status === 'scheduled' ? new Date(Date.now() + (userIndex + 6) * 60 * 60 * 1000) : null;
      const draftSavedAt = status === 'draft' ? new Date(createdAt.getTime() + 20 * 60 * 1000) : null;
      const result = await db.run(
        `INSERT INTO posts(
          username, text, image_url, visibility, category, status, scheduled_publish_at, published_at, draft_saved_at,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
        u.id,
        text,
        imageUrl,
        visibility,
        category,
        status,
        scheduledPublishAt ? toSqliteDateTime(scheduledPublishAt) : null,
        publishedAt ? toSqliteDateTime(publishedAt) : null,
        draftSavedAt ? toSqliteDateTime(draftSavedAt) : null,
        toSqliteDateTime(createdAt),
      );

      const postId = result.lastID as number;
      posts.push({ id: postId, userId: u.id, createdAt, status, category });
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
    const opener = pickBySequence(commentOpenersByCategory[p.category].openers, postIndex, Math.max(ownerIndex, 0), 3);
    const support = fillTemplate(
      pickBySequence(commentSupportLines, postIndex + ownerIndex, postIndex + 1, 5),
      { owner: owner.username },
    );
    const ownerReply = fillTemplate(
      pickBySequence(commentOwnerReplies, postIndex + participants.indexOf(firstCommenter), postIndex + 2, 7),
      { first: firstCommenter.username },
    );
    const followUp = fillTemplate(
      pickBySequence(commentFollowUps, postIndex + participants.indexOf(secondCommenter), postIndex + 3, 11),
      { second: secondCommenter.username },
    ) + ` [thread ${pad2(postIndex + 1)}]`;

    const commentPlan = [
      {
        commenter: firstCommenter,
        text: opener,
      },
      {
        commenter: secondCommenter,
        text: support,
      },
      {
        commenter: owner,
        text: ownerReply,
      },
      {
        commenter: thirdCommenter,
        text: followUp,
      },
    ] as const;

    for (let i = 0; i < commentPlan.length; i++) {
      const plan = commentPlan[i]!;
      const createdAt = new Date(p.createdAt.getTime() + (i + 1) * 35 * 60 * 1000);

      const result = await db.run(
        `INSERT INTO comments(
          post_id, username, text, created_at
        ) VALUES (?, ?, ?, ?)`,
        p.id,
        plan.commenter.id,
        plan.text,
        toSqliteDateTime(createdAt),
      );

      const commentId = result.lastID as number;
      comments.push({ id: commentId, postId: p.id, userId: plan.commenter.id, createdAt });
    }
  }

  return comments;
};

const seedLikes = async (users: SeededUser[], posts: SeededPost[]) => {
  const db = await getDb();

  for (let userIndex = 0; userIndex < users.length; userIndex++) {
    const u = users[userIndex]!;
    for (let postIndex = 0; postIndex < posts.length; postIndex++) {
      const p = posts[postIndex]!;
      if (p.status !== 'published') continue;
      if (u.id === p.userId) continue;
      if (((userIndex + 1) * (postIndex + 3)) % 5 >= 2) continue;
      const createdAt = timeBetween(p.createdAt, demoNow, userIndex + postIndex + 1, users.length + posts.length + 1);
      await db.run(
        'INSERT OR IGNORE INTO likes(username, post_id, created_at) VALUES (?, ?, ?)',
        u.id,
        p.id,
        toSqliteDateTime(createdAt),
      );
    }
  }
};

const seedPostCollections = async (users: SeededUser[], posts: SeededPost[]) => {
  const db = await getDb();

  for (let userIndex = 0; userIndex < users.length; userIndex++) {
    const user = users[userIndex]!;
    for (let postIndex = 0; postIndex < posts.length; postIndex++) {
      const post = posts[postIndex]!;
      if (post.status !== 'published' || post.userId === user.id) continue;
      if (((userIndex + 2) * (postIndex + 5)) % 7 >= 3) continue;
      const createdAt = timeBetween(post.createdAt, demoNow, userIndex + postIndex + 2, users.length + posts.length + 2);
      await db.run(
        'INSERT OR IGNORE INTO post_collections(username, post_id, created_at) VALUES (?, ?, ?)',
        user.id,
        post.id,
        toSqliteDateTime(createdAt),
      );
    }
  }
};

const seedDemoOwnerNotifications = async (ownerUsername: string) => {
  const db = await getDb();

  const likeRows = await db.all<{ post_id: number; actor_username: string }[]>(
    `SELECT p.id AS post_id, l.username AS actor_username
     FROM posts p
     JOIN likes l ON l.post_id = p.id
     WHERE p.username = ?
       AND l.username <> p.username
     ORDER BY p.created_at ASC, l.created_at ASC
     LIMIT 3`,
    ownerUsername,
  );

  for (const row of likeRows) {
    await createNotification({
      userId: ownerUsername,
      type: 'post_liked',
      actorUsername: row.actor_username,
      entityType: 'post',
      entityId: row.post_id,
    });
  }

  const commentRows = await db.all<{ post_id: number; actor_username: string }[]>(
    `SELECT p.id AS post_id, c.username AS actor_username
     FROM posts p
     JOIN comments c ON c.post_id = p.id
     WHERE p.username = ?
       AND c.username <> p.username
     ORDER BY p.created_at ASC, c.created_at ASC
     LIMIT 3`,
    ownerUsername,
  );

  for (const row of commentRows) {
    await createNotification({
      userId: ownerUsername,
      type: 'post_commented',
      actorUsername: row.actor_username,
      entityType: 'post',
      entityId: row.post_id,
    });
  }
};

const seedFriendships = async (users: SeededUser[]) => {
  const db = await getDb();

  const acceptedPairs: Array<{ a: SeededUser; b: SeededUser }> = [];

  const acceptedPairsIndex = [
    [0, 1],
    [2, 3],
    [4, 5],
    [6, 7],
    [8, 9],
  ] as const;

  for (let pairIndex = 0; pairIndex < acceptedPairsIndex.length; pairIndex++) {
    const [leftIndex, rightIndex] = acceptedPairsIndex[pairIndex]!;
    const a = users[leftIndex];
    const b = users[rightIndex];
    if (!a || !b) continue;

    acceptedPairs.push({ a, b });

    const { user1, user2 } = normalizePair(a.id, b.id);
    const actionUserId = pairIndex % 2 === 0 ? a.id : b.id;
    const createdAt = toSqliteDateTime(daysAgo(45 - pairIndex * 4, pairIndex + 1));

    await db.run(
      "INSERT OR IGNORE INTO friendships(username1, username2, status, action_user_id, created_at, updated_at) VALUES (?, ?, 'accepted', ?, ?, ?)",
      user1,
      user2,
      actionUserId,
      createdAt,
      createdAt,
    );

    const receiverId = actionUserId === a.id ? b.id : a.id;
    await createNotification({
      userId: receiverId,
      type: 'friend_request_accepted',
      actorUsername: actionUserId,
      entityType: 'user',
      entityId: actionUserId,
    });
  }

  const pendingPairsIndex = [
    [0, 2],
    [1, 3],
    [2, 4],
    [3, 5],
    [4, 6],
    [5, 7],
  ] as const;

  for (let pairIndex = 0; pairIndex < pendingPairsIndex.length; pairIndex++) {
    const [senderIndex, receiverIndex] = pendingPairsIndex[pairIndex]!;
    const sender = users[senderIndex];
    const receiver = users[receiverIndex];
    if (!sender || !receiver) continue;

    const { user1, user2 } = normalizePair(sender.id, receiver.id);
    const createdAt = toSqliteDateTime(daysAgo(12 - pairIndex, pairIndex));

    const result = await db.run(
      "INSERT OR IGNORE INTO friendships(username1, username2, status, action_user_id, created_at, updated_at) VALUES (?, ?, 'pending', ?, ?, NULL)",
      user1,
      user2,
      sender.id,
      createdAt,
    );

    if ((result.changes ?? 0) > 0) {
      await createNotification({
        userId: receiver.id,
        type: 'friend_request_received',
        actorUsername: sender.id,
        entityType: 'user',
        entityId: sender.id,
      });
    }
  }

  return acceptedPairs;
};

const main = async () => {
  const { force } = parseArgs(process.argv.slice(2));

  await resetDatabaseInPlace(force);

  console.log('Initializing schema...');
  await runMigrations();

  const db = await getDb();
  const existingPosts = await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM posts');
  if (!force && (existingPosts?.count ?? 0) > 0) {
    console.log('Demo data already exists; skipping seed. Use --force to rebuild it.');
    return;
  }

  console.log('Creating users...');
  await seedAdmin();
  const regularUsers = await seedRegularUsers();

  console.log('Creating friendships...');
  await seedFriendships(regularUsers);

  console.log('Creating posts...');
  const posts = await seedPosts(regularUsers);

  console.log('Creating comments...');
  await seedComments(regularUsers, posts);

  console.log('Creating likes...');
  await seedLikes(regularUsers, posts);

  console.log('Creating collections...');
  await seedPostCollections(regularUsers, posts);

  console.log('Creating demo notifications...');
  await seedDemoOwnerNotifications('seed_user01');

  console.log('Done seeding test data.');
  console.log('Accounts:');
  console.log('  - admin / admin123');
  console.log('  - seed_user01..seed_user10 / password123');
};

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
