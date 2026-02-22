-- Remove "private" post visibility by converting existing data to "friends".

UPDATE posts
SET visibility = 'friends'
WHERE visibility = 'private';

