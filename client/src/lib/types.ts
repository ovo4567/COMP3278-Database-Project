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

export type LocationSummary = {
  country: string | null;
  region: string | null;
  city: string | null;
  label: string | null;
};

export type AuthorMeta = {
  ip: string | null;
  location: LocationSummary;
};

export type User = {
  id: number;
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
  friendship?: { status: 'pending' | 'accepted' | 'rejected'; actionUserId: number | null } | null;
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
  viewCount: number;
  likedByMe?: boolean;
  collectedByMe?: boolean;
  createdAt: string;
  updatedAt: string | null;
  authorMeta: AuthorMeta;
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

export type PostAnalytics = {
  post: { id: number; text: string; status: PostStatus };
  overview: {
    views: number;
    likes: number;
    collects: number;
    comments: number;
  };
  series: Array<{ day: string; views: number; likes: number; collects: number; comments: number }>;
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
};

export type SearchUser = {
  id: number;
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
  id: number;
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
  actorUser?: { id: number; username: string; displayName: string | null; avatarUrl: string | null } | null;
  entity?: { type: string; id: number } | null;
};

export type NotifyEvent =
  | {
      type: 'notification_created';
      notification: NotificationItem;
    };

export type Comment = {
  id: number;
  parentCommentId: number | null;
  text: string;
  createdAt: string;
  likeCount: number;
  collectCount: number;
  likedByMe: boolean;
  collectedByMe: boolean;
  authorMeta: AuthorMeta;
  parentUser?: {
    username: string;
    displayName: string | null;
  } | null;
  user: {
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
};

export type DeviceSession = {
  id: string;
  userAgent: string | null;
  ip: string | null;
  location: LocationSummary;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  current: boolean;
};

export type RealtimeEvent =
  | { type: 'post_created'; postId: number }
  | { type: 'post_updated'; postId: number }
  | { type: 'post_deleted'; postId: number }
  | { type: 'post_liked'; postId: number; likeCount: number; userId?: number; liked?: boolean }
  | { type: 'comment_created'; postId: number; commentId: number };
