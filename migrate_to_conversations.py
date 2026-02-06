#!/usr/bin/env python3
import sqlite3
import shutil
import os
import datetime

ROOT = os.path.dirname(__file__)
DB_PATH = os.path.join(ROOT, "demo_chat_app.sqlite")


def has_column(conn, table, col):
    cur = conn.execute(f"PRAGMA table_info({table})")
    return any(r[1] == col for r in cur.fetchall())


def backup_db(path):
    ts = datetime.datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    bak = f"{path}.bak.{ts}"
    shutil.copy(path, bak)
    return bak


def main():
    if not os.path.exists(DB_PATH):
        print("Database not found:", DB_PATH)
        return

    bak = backup_db(DB_PATH)
    print("Backup created:", bak)

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    # Create conversations table
    c.execute(
        """
        CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL CHECK(type IN ('dm','group')),
            title TEXT,
            metadata TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            last_activity_at TEXT
        );
        """
    )

    # Create participants table
    c.execute(
        """
        CREATE TABLE IF NOT EXISTS conversation_participants (
            conversation_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            role TEXT DEFAULT 'member',
            last_read_at TEXT,
            PRIMARY KEY (conversation_id, user_id),
            FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        """
    )

    # Add conversation_id to groups if missing
    if not has_column(conn, 'groups', 'conversation_id'):
        c.execute("ALTER TABLE groups ADD COLUMN conversation_id INTEGER")
        print("Added groups.conversation_id column")

    # Add conversation_id to messages if missing
    if not has_column(conn, 'messages', 'conversation_id'):
        c.execute("ALTER TABLE messages ADD COLUMN conversation_id INTEGER")
        print("Added messages.conversation_id column")

    conn.commit()

    # For each group, create a conversation and link
    groups = c.execute("SELECT id, name, created_at FROM groups").fetchall()
    created = 0
    for g in groups:
        # If group already has conversation_id filled, skip
        if g['id'] is None:
            continue
        row = c.execute("SELECT conversation_id FROM groups WHERE id = ?", (g['id'],)).fetchone()
        if row and row['conversation_id']:
            continue
        c.execute("INSERT INTO conversations (type, title, created_at) VALUES ('group', ?, ?)", (g['name'], g['created_at']))
        conv_id = c.lastrowid
        c.execute("UPDATE groups SET conversation_id = ? WHERE id = ?", (conv_id, g['id']))
        created += 1

    print(f"Created {created} group conversations")

    # Migrate group_members -> conversation_participants
    c.execute(
        "INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id, role) SELECT g.conversation_id, gm.user_id, gm.role FROM group_members gm JOIN groups g ON gm.group_id = g.id WHERE g.conversation_id IS NOT NULL;"
    )
    conn.commit()
    print("Migrated group_members into conversation_participants")

    # Update messages to set conversation_id from groups mapping
    c.execute("UPDATE messages SET conversation_id = (SELECT conversation_id FROM groups WHERE id = messages.group_id) WHERE group_id IS NOT NULL")
    conn.commit()
    updated = c.execute("SELECT COUNT(1) as cnt FROM messages WHERE conversation_id IS NOT NULL").fetchone()['cnt']
    print(f"Updated {updated} messages with conversation_id")

    # Create useful indexes
    c.execute("CREATE INDEX IF NOT EXISTS idx_conversations_last_activity ON conversations(last_activity_at)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_conv_part_user ON conversation_participants(user_id)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_messages_conv_time ON messages(conversation_id, created_at)")
    conn.commit()

    print("Migration complete. Note: DM conversations (type='dm') are not auto-created from messages because recipient info is not stored. Consider creating DM conversations explicitly for pairs.")
    conn.close()


if __name__ == '__main__':
    main()
