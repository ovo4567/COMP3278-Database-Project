import { runMigrations } from '../db/migrate.js';
import { getDb } from '../db/sqlite.js';
import { config } from '../config.js';
import { hashPassword } from '../auth/passwords.js';

const main = async () => {
  await runMigrations();
  const db = await getDb();

  const existing = await db.get('SELECT id FROM users WHERE username = ?', config.adminUsername);
  if (existing) {
    console.log('Admin already exists');
    return;
  }

  const passwordHash = await hashPassword(config.adminPassword);
  await db.run(
    'INSERT INTO users(username, password_hash, role, display_name) VALUES (?, ?, ?, ?)',
    config.adminUsername,
    passwordHash,
    'admin',
    'Admin',
  );

  console.log(`Seeded admin user: ${config.adminUsername}`);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
