"""
app.py
A minimal chat-group app + Vanna FastAPI server in one file.

Features (core):
- Multi-user accounts (simple REST create/list)
- Group chats
- Send messages (text + optional image_url) with timestamp stored in DB
- Query chat history by group, by user, by time range
- Vanna Agent server (Text-to-SQL via RunSqlTool) connected to the same SQLite DB
- Like functionality for posts

Run:
  pip install fastapi uvicorn vanna
  export DEEPSEEK_API_KEY="your_key"
  python app.py

Then:
  - REST docs: http://127.0.0.1:8000/docs
  - Vanna endpoints are mounted under /vanna (same server)
"""

from __future__ import annotations

import os
import sqlite3
from typing import Optional, List, Dict, Any
from datetime import datetime

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

# ---- Vanna imports (based on your snippet) ----
from vanna import Agent, AgentConfig
from vanna.core.registry import ToolRegistry
from vanna.core.user import UserResolver, User, RequestContext
from vanna.tools import RunSqlTool, VisualizeDataTool
from vanna.integrations.sqlite import SqliteRunner
from vanna.tools.agent_memory import SaveQuestionToolArgsTool, SearchSavedCorrectToolUsesTool
from vanna.integrations.local.agent_memory import DemoAgentMemory

# If you want DeepSeek via OpenAI-compatible API:
from vanna.integrations.openai import OpenAILlmService

from fastapi.middleware.cors import CORSMiddleware


DB_PATH = "./demo_chat_app.sqlite"


# =========================================================
# 1) Database init (creates empty DB file + schema)
# =========================================================
SCHEMA_SQL = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',  -- e.g. member/admin
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (group_id, user_id),
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  content TEXT,            -- nullable if only image_url
  image_url TEXT,          -- optional
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Add likes table for post likes
CREATE TABLE IF NOT EXISTS message_likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(message_id, user_id),
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Add user profile table
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id INTEGER PRIMARY KEY,
  bio TEXT,
  website TEXT,
  location TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_group_time ON messages(group_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_user_time ON messages(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_message_likes_message ON message_likes(message_id);
CREATE INDEX IF NOT EXISTS idx_message_likes_user ON message_likes(user_id);
"""


def init_db(db_path: str = DB_PATH) -> None:
    """
    Creating an 'empty' SQLite DB is equivalent to creating/opening the file.
    Then we apply schema. Safe to call on every startup.
    """
    conn = sqlite3.connect(db_path)
    try:
        conn.executescript(SCHEMA_SQL)
        conn.commit()
    finally:
        conn.close()


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


# =========================================================
# 2) REST API models
# =========================================================
class CreateUserReq(BaseModel):
    username: str = Field(..., min_length=1, max_length=64)
    display_name: Optional[str] = Field(None, max_length=128)
    avatar_url: Optional[str] = Field(None, max_length=512)


class UpdateUserProfileReq(BaseModel):
    display_name: Optional[str] = Field(None, max_length=128)
    bio: Optional[str] = Field(None, max_length=500)
    website: Optional[str] = Field(None, max_length=256)
    location: Optional[str] = Field(None, max_length=128)
    avatar_url: Optional[str] = Field(None, max_length=512)


class CreateGroupReq(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    description: Optional[str] = Field(None, max_length=500)


class AddMemberReq(BaseModel):
    username: str
    role: str = "member"


class SendMessageReq(BaseModel):
    username: str
    content: Optional[str] = Field(None, max_length=2000)
    image_url: Optional[str] = Field(None, max_length=1024)


class LikeMessageReq(BaseModel):
    username: str


class MessageOut(BaseModel):
    id: int
    group_id: int
    username: str
    display_name: Optional[str]
    avatar_url: Optional[str]
    content: Optional[str]
    image_url: Optional[str]
    created_at: str
    like_count: int = 0
    liked_by_current_user: bool = False


class UserOut(BaseModel):
    id: int
    username: str
    display_name: Optional[str]
    avatar_url: Optional[str]
    bio: Optional[str]
    website: Optional[str]
    location: Optional[str]
    created_at: str
    post_count: Optional[int] = 0


class GroupOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    member_count: Optional[int] = 0
    created_at: str


# =========================================================
# 3) REST helpers
# =========================================================
def get_user_id(conn: sqlite3.Connection, username: str) -> int:
    row = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"User not found: {username}")
    return int(row["id"])


def get_user_info(conn: sqlite3.Connection, user_id: int) -> Dict[str, Any]:
    row = conn.execute("""
        SELECT u.id, u.username, u.display_name, u.avatar_url, 
               up.bio, up.website, up.location, u.created_at
        FROM users u
        LEFT JOIN user_profiles up ON u.id = up.user_id
        WHERE u.id = ?
    """, (user_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"User not found: {user_id}")
    return dict(row)


def get_group_id(conn: sqlite3.Connection, group_name: str) -> int:
    row = conn.execute("SELECT id FROM groups WHERE name = ?", (group_name,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"Group not found: {group_name}")
    return int(row["id"])


def get_message_like_info(conn: sqlite3.Connection, message_id: int, username: Optional[str] = None) -> Dict[str, Any]:
    """Get like count and whether a specific user liked the message"""
    like_count_row = conn.execute(
        "SELECT COUNT(*) as count FROM message_likes WHERE message_id = ?",
        (message_id,)
    ).fetchone()
    like_count = int(like_count_row["count"]) if like_count_row else 0
    
    liked_by_user = False
    if username:
        user_id = get_user_id(conn, username)
        like_row = conn.execute(
            "SELECT 1 FROM message_likes WHERE message_id = ? AND user_id = ?",
            (message_id, user_id)
        ).fetchone()
        liked_by_user = bool(like_row)
    
    return {"like_count": like_count, "liked_by_user": liked_by_user}


# =========================================================
# 4) Vanna user resolver (cookie-based like your code)
# =========================================================
class SimpleUserResolver(UserResolver):
    async def resolve_user(self, request_context: RequestContext) -> User:
        user_email = request_context.get_cookie("vanna_email")
        if not user_email:
            raise ValueError("Missing 'vanna_email' cookie for user identification")

        if user_email == "admin@example.com":
            return User(id="admin1", email=user_email, group_memberships=["admin"])

        return User(id="user1", email=user_email, group_memberships=["user"])

# =========================================================
# 5) Build FastAPI + mount Vanna server
# =========================================================
init_db(DB_PATH)

app = FastAPI(title="Chat Group App + Vanna", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173", "http://127.0.0.1:8000", "http://localhost:8000", "*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---- Build Vanna Agent (same DB) ----
tools = ToolRegistry()
tools.register_local_tool(
    RunSqlTool(sql_runner=SqliteRunner(database_path=DB_PATH)),
    access_groups=["admin", "user"],
)
tools.register_local_tool(VisualizeDataTool(), access_groups=["admin", "user"])

agent_memory = DemoAgentMemory(max_items=1000)
tools.register_local_tool(SaveQuestionToolArgsTool(), access_groups=["admin"])
tools.register_local_tool(SearchSavedCorrectToolUsesTool(), access_groups=["admin", "user"])

# HARD-CODE API key here
DEEPSEEK_API_KEY = "sk-7439e8bea58b4a0a9f1e9f718c772c2e" #os.getenv("DEEPSEEK_API_KEY", "").strip()

if not DEEPSEEK_API_KEY:
    # You can still run REST APIs without LLM, but Vanna needs the key to work properly.
    # We'll not crash; we'll warn in logs.
    print("[WARN] DEEPSEEK_API_KEY is empty. Vanna LLM calls may fail.")

llm = OpenAILlmService(
    api_key=DEEPSEEK_API_KEY,
    model="deepseek-chat",  # or "deepseek-reasoner"
    base_url="https://api.deepseek.com/v1",
)

agent = Agent(
    llm_service=llm,
    tool_registry=tools,
    user_resolver=SimpleUserResolver(),
    config=AgentConfig(max_tool_iterations=50),
    agent_memory=agent_memory,
)

from vanna.servers.fastapi.routes import register_chat_routes
from vanna.servers.base import ChatHandler

chat_handler = ChatHandler(agent)

# 默认会注册类似：
# - POST /api/vanna/v2/chat_sse
# - GET  / (可选 web UI，看版本实现)
register_chat_routes(app, chat_handler)


# =========================================================
# 6) REST endpoints for chat app
# =========================================================
@app.get("/health")
def health():
    return {"ok": True, "db_path": DB_PATH}


@app.post("/users")
def create_user(req: CreateUserReq):
    conn = get_conn()
    try:
        try:
            conn.execute(
                "INSERT INTO users (username, display_name, avatar_url) VALUES (?, ?, ?)",
                (req.username, req.display_name or req.username, req.avatar_url)
            )
            user_id = conn.execute("SELECT last_insert_rowid() as id").fetchone()["id"]
            # Create empty profile
            conn.execute(
                "INSERT INTO user_profiles (user_id) VALUES (?)",
                (user_id,)
            )
            conn.commit()
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=409, detail="Username already exists")
        
        user_info = get_user_info(conn, user_id)
        return user_info
    finally:
        conn.close()


@app.get("/users")
def list_users():
    conn = get_conn()
    try:
        rows = conn.execute("""
            SELECT u.id, u.username, u.display_name, u.avatar_url, 
                   up.bio, up.website, up.location, u.created_at,
                   COUNT(m.id) as post_count
            FROM users u
            LEFT JOIN user_profiles up ON u.id = up.user_id
            LEFT JOIN messages m ON u.id = m.user_id
            GROUP BY u.id
            ORDER BY u.created_at DESC
        """).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@app.get("/users/{username}")
def get_user(username: str):
    conn = get_conn()
    try:
        user_id = get_user_id(conn, username)
        user_info = get_user_info(conn, user_id)
        
        # Get user's post count
        post_count_row = conn.execute(
            "SELECT COUNT(*) as count FROM messages WHERE user_id = ?",
            (user_id,)
        ).fetchone()
        user_info["post_count"] = int(post_count_row["count"]) if post_count_row else 0
        
        return user_info
    finally:
        conn.close()


@app.put("/users/{username}/profile")
def update_user_profile(username: str, req: UpdateUserProfileReq):
    conn = get_conn()
    try:
        user_id = get_user_id(conn, username)
        
        # Update user table
        if req.display_name is not None or req.avatar_url is not None:
            update_fields = []
            update_values = []
            if req.display_name is not None:
                update_fields.append("display_name = ?")
                update_values.append(req.display_name)
            if req.avatar_url is not None:
                update_fields.append("avatar_url = ?")
                update_values.append(req.avatar_url)
            
            if update_fields:
                update_values.append(user_id)
                conn.execute(
                    f"UPDATE users SET {', '.join(update_fields)} WHERE id = ?",
                    update_values
                )
        
        # Update or insert profile
        profile_exists = conn.execute(
            "SELECT 1 FROM user_profiles WHERE user_id = ?",
            (user_id,)
        ).fetchone()
        
        if profile_exists:
            # Update existing profile
            update_fields = []
            update_values = []
            if req.bio is not None:
                update_fields.append("bio = ?")
                update_values.append(req.bio)
            if req.website is not None:
                update_fields.append("website = ?")
                update_values.append(req.website)
            if req.location is not None:
                update_fields.append("location = ?")
                update_values.append(req.location)
            
            if update_fields:
                update_values.append(user_id)
                conn.execute(
                    f"UPDATE user_profiles SET {', '.join(update_fields)} WHERE user_id = ?",
                    update_values
                )
        else:
            # Insert new profile
            conn.execute(
                "INSERT INTO user_profiles (user_id, bio, website, location) VALUES (?, ?, ?, ?)",
                (user_id, req.bio, req.website, req.location)
            )
        
        conn.commit()
        return get_user_info(conn, user_id)
    finally:
        conn.close()


@app.post("/groups")
def create_group(req: CreateGroupReq):
    conn = get_conn()
    try:
        try:
            conn.execute(
                "INSERT INTO groups (name, description) VALUES (?, ?)",
                (req.name, req.description)
            )
            conn.commit()
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=409, detail="Group name already exists")
        row = conn.execute("SELECT id, name, description, created_at FROM groups WHERE name = ?", (req.name,)).fetchone()
        return dict(row)
    finally:
        conn.close()


@app.get("/groups")
def list_groups():
    conn = get_conn()
    try:
        rows = conn.execute("""
            SELECT g.id, g.name, g.description, g.created_at,
                   COUNT(gm.user_id) as member_count
            FROM groups g
            LEFT JOIN group_members gm ON g.id = gm.group_id
            GROUP BY g.id
            ORDER BY g.created_at DESC
        """).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@app.post("/groups/{group_name}/members")
def add_member(group_name: str, req: AddMemberReq):
    conn = get_conn()
    try:
        gid = get_group_id(conn, group_name)
        uid = get_user_id(conn, req.username)
        try:
            conn.execute(
                "INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)",
                (gid, uid, req.role),
            )
            conn.commit()
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=409, detail="User is already a member of this group")

        row = conn.execute(
            """
            SELECT g.name AS group_name, u.username, gm.role, gm.joined_at
            FROM group_members gm
            JOIN users u ON u.id = gm.user_id
            JOIN groups g ON g.id = gm.group_id
            WHERE gm.group_id = ? AND gm.user_id = ?
            """,
            (gid, uid),
        ).fetchone()
        return dict(row)
    finally:
        conn.close()


@app.post("/groups/{group_name}/messages")
def send_message(group_name: str, req: SendMessageReq):
    if (req.content is None or req.content.strip() == "") and (req.image_url is None or req.image_url.strip() == ""):
        raise HTTPException(status_code=400, detail="Either content or image_url must be provided")

    conn = get_conn()
    try:
        gid = get_group_id(conn, group_name)
        uid = get_user_id(conn, req.username)

        # ensure membership
        mem = conn.execute(
            "SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?",
            (gid, uid),
        ).fetchone()
        if not mem:
            raise HTTPException(status_code=403, detail="User is not a member of this group")

        conn.execute(
            "INSERT INTO messages (group_id, user_id, content, image_url) VALUES (?, ?, ?, ?)",
            (gid, uid, req.content, req.image_url),
        )
        conn.commit()

        row = conn.execute(
            """
            SELECT m.id, m.group_id, u.username, u.display_name, u.avatar_url, 
                   m.content, m.image_url, m.created_at
            FROM messages m
            JOIN users u ON u.id = m.user_id
            WHERE m.rowid = last_insert_rowid()
            """
        ).fetchone()
        
        message_data = dict(row)
        # Add like info (0 likes initially)
        message_data["like_count"] = 0
        message_data["liked_by_current_user"] = False
        
        return message_data
    finally:
        conn.close()


@app.get("/groups/{group_name}/messages", response_model=List[MessageOut])
def get_messages(
    group_name: str,
    limit: int = 50,
    before: Optional[str] = None,  # ISO-like text, e.g. "2026-01-18 12:00:00"
    after: Optional[str] = None,
    username: Optional[str] = None,  # Optional: filter by specific user and check likes
):
    if limit < 1 or limit > 500:
        raise HTTPException(status_code=400, detail="limit must be between 1 and 500")

    conn = get_conn()
    try:
        gid = get_group_id(conn, group_name)

        where = ["m.group_id = ?"]
        params = [gid]

        if after:
            where.append("m.created_at >= ?")
            params.append(after)
        if before:
            where.append("m.created_at < ?")
            params.append(before)

        where_sql = " AND ".join(where)

        rows = conn.execute(
            f"""
            SELECT m.id, m.group_id, u.username, u.display_name, u.avatar_url, 
                   m.content, m.image_url, m.created_at
            FROM messages m
            JOIN users u ON u.id = m.user_id
            WHERE {where_sql}
            ORDER BY m.created_at DESC
            LIMIT ?
            """,
            (*params, limit),
        ).fetchall()

        messages = []
        for row in rows:
            message_data = dict(row)
            # Get like info for each message
            like_info = get_message_like_info(conn, message_data["id"], username)
            message_data["like_count"] = like_info["like_count"]
            message_data["liked_by_current_user"] = like_info["liked_by_user"]
            messages.append(MessageOut(**message_data))

        return messages
    finally:
        conn.close()


@app.post("/messages/{message_id}/like")
def like_message(message_id: int, req: LikeMessageReq):
    conn = get_conn()
    try:
        uid = get_user_id(conn, req.username)
        
        # Check if message exists
        message_row = conn.execute(
            "SELECT id, group_id FROM messages WHERE id = ?",
            (message_id,)
        ).fetchone()
        if not message_row:
            raise HTTPException(status_code=404, detail="Message not found")
        
        # Check if user is member of the group
        group_id = message_row["group_id"]
        mem = conn.execute(
            "SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?",
            (group_id, uid),
        ).fetchone()
        if not mem:
            raise HTTPException(status_code=403, detail="User is not a member of this group")
        
        # Check if already liked
        existing_like = conn.execute(
            "SELECT id FROM message_likes WHERE message_id = ? AND user_id = ?",
            (message_id, uid)
        ).fetchone()
        
        if existing_like:
            # Unlike: remove the like
            conn.execute(
                "DELETE FROM message_likes WHERE id = ?",
                (existing_like["id"],)
            )
            action = "unliked"
        else:
            # Like: add new like
            conn.execute(
                "INSERT INTO message_likes (message_id, user_id) VALUES (?, ?)",
                (message_id, uid)
            )
            action = "liked"
        
        conn.commit()
        
        # Get updated like info
        like_info = get_message_like_info(conn, message_id, req.username)
        
        return {
            "message_id": message_id,
            "action": action,
            "like_count": like_info["like_count"],
            "liked_by_user": like_info["liked_by_user"]
        }
    finally:
        conn.close()


@app.get("/messages/{message_id}/likes")
def get_message_likes(message_id: int):
    conn = get_conn()
    try:
        # Check if message exists
        message_row = conn.execute(
            "SELECT id FROM messages WHERE id = ?",
            (message_id,)
        ).fetchone()
        if not message_row:
            raise HTTPException(status_code=404, detail="Message not found")
        
        # Get users who liked this message
        rows = conn.execute("""
            SELECT u.id, u.username, u.display_name, u.avatar_url, ml.created_at
            FROM message_likes ml
            JOIN users u ON u.id = ml.user_id
            WHERE ml.message_id = ?
            ORDER BY ml.created_at DESC
        """, (message_id,)).fetchall()
        
        return [dict(r) for r in rows]
    finally:
        conn.close()


# =========================================================
# 7) Entrypoint
# =========================================================
if __name__ == "__main__":
    # Use uvicorn so everything runs in one server.
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)