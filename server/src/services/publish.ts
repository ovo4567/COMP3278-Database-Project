import { getDb } from '../db/sqlite.js';

export const publishDueScheduledPosts = async (): Promise<void> => {
  const db = await getDb();
  await db.run(
    `UPDATE posts
     SET status = 'published',
         published_at = COALESCE(published_at, scheduled_publish_at, datetime('now'))
     WHERE status = 'scheduled'
       AND scheduled_publish_at IS NOT NULL
       AND datetime(scheduled_publish_at) <= datetime('now')`,
  );
};

let publishTimer: NodeJS.Timeout | null = null;

export const startPublishScheduler = (intervalMs = 15_000): void => {
  if (publishTimer) return;

  void publishDueScheduledPosts().catch((error) => {
    console.error('Initial scheduled-post publish failed', error);
  });

  publishTimer = setInterval(() => {
    void publishDueScheduledPosts().catch((error) => {
      console.error('Scheduled-post publish failed', error);
    });
  }, intervalMs);

  publishTimer.unref?.();
};
