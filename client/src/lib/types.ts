export type Role = 'user' | 'admin';
export type PostStatus = 'draft' | 'scheduled' | 'published';

export const POST_CATEGORIES = ['all', 'food', 'studies', 'jobs', 'travel', 'others'] as const;
export type PostCategory = (typeof POST_CATEGORIES)[number];
export const POST_CATEGORY_LABELS: Record<PostCategory, string> = {
  all: 'All',
  food: 'Food',
  studies: 'Studies',
  jobs: 'Jobs',
  travel: 'Travel',
  others: 'Others',
};

export type User = {
  id: string;
  username: string;
  role: Role;
  displayName: string | null;
  status: string | null;
  bio: string | null;
  avatarUrl: string | null;
};

export type UserProfile = User & {
  createdAt: string;
  stats?: { postCount: number; likesReceived: number };
  friendCount?: number;
  friendship?: { status: 'pending' | 'accepted' | 'rejected'; actionUserId: string | null } | null;
};

export type FeedPost = {
  id: number;
  text: string;
  imageUrl: string | null;
  category: PostCategory;
  visibility?: 'public' | 'friends';
  status: PostStatus;
  scheduledPublishAt: string | null;
  publishedAt: string | null;
  likeCount: number;
  collectCount: number;
  likedByMe?: boolean;
  collectedByMe?: boolean;
  createdAt: string;
  updatedAt: string | null;
  user: {
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
};

export type ManagedPost = FeedPost;

export type PostDetail = FeedPost & {
  commentCount: number;
};

export type AdminAnalytics = {
  generatedAt: string;
  days: number;
  users: {
    total: number;
    new: { today: number; week: number; month: number };
    series: Array<{ day: string; newUsers: number; activeUsers: number }>;
    top: {
      byPosts: Array<{ id: number; username: string; displayName: string | null; value: number }>;
      byLikesReceived: Array<{ id: number; username: string; displayName: string | null; value: number }>;
      byCommentsMade: Array<{ id: number; username: string; displayName: string | null; value: number }>;
    };
  };
  posts: {
    total: number;
    series: Array<{ day: string; newPosts: number }>;
    mostLiked: Array<{ id: number; text: string; likeCount: number; createdAt: string; username: string }>;
    mostCommented: Array<{ id: number; text: string; commentCount: number; createdAt: string; username: string }>;
    perUserAverage: number;
    perUserBuckets: Array<{ bucket: string; count: number }>;
  };
  engagement: {
    totalLikes: number;
    totalComments: number;
    series: Array<{ day: string; likes: number; comments: number }>;
    likeToPostRatio: number;
    commentToPostRatio: number;
  };
  friends: {
    totalAccepted: number;
    totalPending: number;
    totalRejected: number;
    requests: { today: number; week: number; month: number; window: number };
    accepted: { today: number; week: number; month: number; window: number };
    acceptanceRate: number;
    avgFriendsPerUser: number;
    series: Array<{ day: string; requests: number; accepted: number }>;
    topByFriends: Array<{ id: number; username: string; displayName: string | null; value: number }>;
  };
};

export type AdminSqlResult = {
  columns: string[];
  rows: Array<Array<unknown>>;
  rowCount: number;
  limited: boolean;
  executionMs?: number;
};

export type SearchUser = {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  status: string | null;
};

export type SearchResults = {
  q: string;
  users: SearchUser[];
  posts: FeedPost[];
};

export type FriendUser = {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  status: string | null;
};

export type FriendRequestItem = {
  user: FriendUser;
  createdAt: string;
};

export type NotificationItem = {
  id: number;
  type: string;
  createdAt: string;
  isRead: boolean;
  actorUser?: { id: string; username: string; displayName: string | null; avatarUrl: string | null } | null;
};

export type NotifyEvent =
  | {
      type: 'notification_created';
      notification: NotificationItem;
    };

export type Comment = {
  id: number;
  text: string;
  createdAt: string;
  user: {
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
};

export type RealtimeEvent =
  | { type: 'post_created'; postId: number }
  | { type: 'post_updated'; postId: number }
  | { type: 'post_deleted'; postId: number }
  | { type: 'post_liked'; postId: number; likeCount: number; userId?: string; liked?: boolean }
  | { type: 'comment_created'; postId: number; commentId: number };
