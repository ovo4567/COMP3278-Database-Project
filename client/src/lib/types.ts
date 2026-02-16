export type Role = 'user' | 'admin';

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
  visibility?: 'public' | 'friends' | 'private';
  likeCount: number;
  likedByMe?: boolean;
  createdAt: string;
  updatedAt: string | null;
  user: {
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
};

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
  chat: {
    totalMessages: number;
    series: Array<{ day: string; messages: number }>;
    mostActiveGroups: Array<{ id: number; name: string; isPrivate: boolean; messageCount: number }>;
    mostActiveChatters: Array<{ id: number; username: string; displayName: string | null; messageCount: number }>;
    imageMessages: number;
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
  | { type: 'post_liked'; postId: number; likeCount: number; userId?: number; liked?: boolean }
  | { type: 'comment_created'; postId: number; commentId: number };

export type ChatGroup = {
  id: number;
  name: string;
  description: string | null;
  isPrivate: boolean;
  createdAt: string;
  memberCount?: number;
  myRole?: 'member' | 'admin';
  lastMessageAt?: string | null;
  isDm?: boolean;
  dmWithUsername?: string | null;
};

export type ChatInvite = {
  id: number;
  groupId: number;
  groupName: string;
  groupDescription: string | null;
  createdAt: string;
};

export type ChatMessage = {
  id: number;
  groupId: number;
  type: 'text' | 'image';
  text: string | null;
  imageUrl: string | null;
  createdAt: string;
  user: { id: number; username: string; displayName: string | null; avatarUrl: string | null };
};

export type ChatMember = {
  id: number;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: 'member' | 'admin';
  joinedAt: string;
};
