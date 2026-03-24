export const postCategories = ['all', 'food', 'studies', 'jobs', 'travel', 'others'] as const;

export type PostCategory = (typeof postCategories)[number];
