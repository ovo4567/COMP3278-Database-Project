import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "demo_chat_app.sqlite")

def main():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    # --- Demo Direct (Individual) Messages ---
    # Insert DMs as messages with group_id NULL and user_id set
    dms = [
        ("alice", "bob", "Hey Bob, can you send me the notes?"),
        ("bob", "alice", "Sure Alice, check your email!"),
        ("carol", "alice", "Hi Alice, want to study together?"),
        ("alice", "carol", "Yes Carol, let's meet at 5pm."),
    ]
    for sender, recipient, content in dms:
        import sqlite3
        import os

        DB_PATH = os.path.join(os.path.dirname(__file__), "demo_chat_app.sqlite")


        def main():
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            c = conn.cursor()

            # --- Demo Users ---
            users = [
                ("alice", "Alice"),
                ("bob", "Bob"),
                ("carol", "Carol"),
                ("dave", "Dave"),
            ]
            for username, display_name in users:
                c.execute("INSERT OR IGNORE INTO users (username, display_name) VALUES (?, ?)", (username, display_name))

            # --- Demo Follows (mutual follows for DMs) ---
            follows = [
                ("alice", "bob"), ("bob", "alice"),
                ("alice", "carol"), ("carol", "alice"),
                ("bob", "carol"), ("carol", "bob"),
                ("dave", "alice"), ("alice", "dave"),
            ]
            for follower, followee in follows:
                c.execute("INSERT OR IGNORE INTO follows (follower_id, followee_id) VALUES ((SELECT id FROM users WHERE username = ?), (SELECT id FROM users WHERE username = ?))", (follower, followee))

            # --- Demo Groups ---
            groups = [
                ("COMP3278 Study Group", "Study group for COMP3278"),
                ("Project Team", "Group for project work"),
            ]
            for name, desc in groups:
                c.execute("INSERT OR IGNORE INTO groups (name, description) VALUES (?, ?)", (name, desc))

            # --- Demo Group Members ---
            group_members = [
                ("COMP3278 Study Group", "alice", "admin"),
                ("COMP3278 Study Group", "bob", "member"),
                ("COMP3278 Study Group", "carol", "member"),
                ("Project Team", "bob", "admin"),
                ("Project Team", "dave", "member"),
            ]
            for group_name, username, role in group_members:
                c.execute("INSERT OR IGNORE INTO group_members (group_id, user_id, role) VALUES ((SELECT id FROM groups WHERE name = ?), (SELECT id FROM users WHERE username = ?), ?) ", (group_name, username, role))

            conn.commit()

            # Ensure each group has a conversation_id (migration may have created these)
            for name, _ in groups:
                row = c.execute("SELECT conversation_id FROM groups WHERE name = ?", (name,)).fetchone()
                if row and row['conversation_id']:
                    continue
                # create conversation
                c.execute("INSERT INTO conversations (type, title) VALUES ('group', ?)", (name,))
                conv_id = c.lastrowid
                c.execute("UPDATE groups SET conversation_id = ? WHERE name = ?", (conv_id, name))
                # migrate members
                c.execute("INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id, role) SELECT ?, gm.user_id, gm.role FROM group_members gm JOIN groups g ON gm.group_id = g.id WHERE g.name = ?", (conv_id, name))

            conn.commit()

            # --- Demo Messages (group posts) ---
            messages = [
                # group_name, username, content
                ("COMP3278 Study Group", "alice", "Welcome to the study group!"),
                ("COMP3278 Study Group", "bob", "Hi everyone! Ready for the exam?"),
                ("COMP3278 Study Group", "carol", "Let's share notes here."),
                ("Project Team", "bob", "Project kickoff meeting at 2pm."),
                ("Project Team", "dave", "I'll bring the slides."),
            ]
            for group_name, username, content in messages:
                c.execute("INSERT INTO messages (conversation_id, user_id, content) VALUES ((SELECT conversation_id FROM groups WHERE name = ?), (SELECT id FROM users WHERE username = ?), ?)", (group_name, username, content))

            conn.commit()

            # --- Demo DM Conversations ---
            dm_pairs = [
                ("alice", "bob"),
                ("alice", "carol"),
            ]
            for a, b in dm_pairs:
                title = f"DM: {a}\u2194{b}"
                # create dm conversation if not exists
                row = c.execute("SELECT id FROM conversations WHERE type = 'dm' AND metadata = ?", (f"dm:{a}:{b}",)).fetchone()
                if row:
                    conv_id = row['id']
                else:
                    c.execute("INSERT INTO conversations (type, title, metadata) VALUES ('dm', ?, ?)", (title, f"dm:{a}:{b}"))
                    conv_id = c.lastrowid
                    # add participants
                    c.execute("INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id, role) VALUES (?, (SELECT id FROM users WHERE username = ?), 'member')", (conv_id, a))
                    c.execute("INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id, role) VALUES (?, (SELECT id FROM users WHERE username = ?), 'member')", (conv_id, b))
                # add sample messages
                c.execute("INSERT INTO messages (conversation_id, user_id, content) VALUES (?, (SELECT id FROM users WHERE username = ?), ?)", (conv_id, a, f"Hi {b}, this is {a}."))
                c.execute("INSERT INTO messages (conversation_id, user_id, content) VALUES (?, (SELECT id FROM users WHERE username = ?), ?)", (conv_id, b, f"Hi {a}, received your message."))

            conn.commit()

            # --- Demo Comments & Likes ---
            # Comment on first study group message
            row = c.execute("SELECT m.id FROM messages m JOIN conversations conv ON m.conversation_id = conv.id JOIN groups g ON g.conversation_id = conv.id WHERE g.name = ? ORDER BY m.id LIMIT 1", ("COMP3278 Study Group",)).fetchone()
            if row:
                mid = row['id']
                c.execute("INSERT INTO comments (message_id, user_id, content) VALUES (?, (SELECT id FROM users WHERE username = ?), ?)", (mid, 'bob', 'Thanks Alice!'))
                c.execute("INSERT INTO comments (message_id, user_id, content) VALUES (?, (SELECT id FROM users WHERE username = ?), ?)", (mid, 'carol', 'Excited to join!'))
                c.execute("INSERT INTO message_likes (message_id, user_id) VALUES (?, (SELECT id FROM users WHERE username = ?))", (mid, 'bob'))
                c.execute("INSERT INTO message_likes (message_id, user_id) VALUES (?, (SELECT id FROM users WHERE username = ?))", (mid, 'carol'))

            # Like a project team message
            row2 = c.execute("SELECT m.id FROM messages m JOIN conversations conv ON m.conversation_id = conv.id JOIN groups g ON g.conversation_id = conv.id WHERE g.name = ? ORDER BY m.id LIMIT 1", ("Project Team",)).fetchone()
            if row2:
                c.execute("INSERT INTO comments (message_id, user_id, content) VALUES (?, (SELECT id FROM users WHERE username = ?), ?)", (row2['id'], 'dave', "I'll be there!"))
                c.execute("INSERT INTO message_likes (message_id, user_id) VALUES (?, (SELECT id FROM users WHERE username = ?))", (row2['id'], 'dave'))

            conn.commit()
            print("Demo conversations, messages, comments, and likes added.")


        if __name__ == "__main__":
            main()
