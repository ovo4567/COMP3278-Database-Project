import { getDb } from './server/src/db/sqlite.ts';

async function check() {
  const db = await getDb();
  
  console.log('--- Duplicate Posts ---');
  const duplicatePosts = await db.all(`
    SELECT content, COUNT(*) as count 
    FROM posts 
    GROUP BY content 
    HAVING count > 1
  `);
  console.log(`Duplicate post groups: ${duplicatePosts.length}`);
  duplicatePosts.slice(0, 3).forEach((p: any) => console.log(`[${p.count}] ${p.content.substring(0, 50)}...`));

  console.log('\n--- Duplicate Comments ---');
  const duplicateComments = await db.all(`
    SELECT content, COUNT(*) as count 
    FROM comments 
    GROUP BY content 
    HAVING count > 1
  `);
  console.log(`Duplicate comment groups: ${duplicateComments.length}`);
  duplicateComments.slice(0, 3).forEach((c: any) => console.log(`[${c.count}] ${c.content.substring(0, 50)}...`));
}

check().catch(console.error);
