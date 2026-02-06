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
import time
import uuid
import sqlite3
from typing import Optional, List, Dict, Any
from datetime import datetime

from fastapi import FastAPI, HTTPException, Request, Response, UploadFile, File, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
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
from passlib.hash import pbkdf2_sha256 as pwd_hasher

from fastapi.middleware.cors import CORSMiddleware


DB_PATH = "./demo_chat_app.sqlite"

# =========================================================
# 0) Basic rate limiting + sanitization helpers
# =========================================================
_RATE_LIMIT: Dict[str, Dict[str, Any]] = {}


def _client_key(request: Optional[Request]) -> str:
    if not request or not request.client:
        return "unknown"
    return request.client.host or "unknown"


def check_rate_limit(request: Optional[Request], key: str, limit: int = 30, window_sec: int = 60) -> None:
    """Simple in-memory, per-IP+key fixed-window rate limit."""
    now = time.time()
    client = _client_key(request)
    bucket_key = f"{client}:{key}"
    state = _RATE_LIMIT.get(bucket_key)
    if not state or (now - state["start"]) > window_sec:
        _RATE_LIMIT[bucket_key] = {"start": now, "count": 1}
        return
    state["count"] += 1
    if state["count"] > limit:
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Please try again later.")


def sanitize_text(value: Optional[str], max_len: Optional[int] = None) -> Optional[str]:
    if value is None:
        return None
    cleaned = value.strip()
    if max_len is not None:
        cleaned = cleaned[:max_len]
    return cleaned


def get_current_user(request: Request) -> str:
    current = request.cookies.get('session_user')
    if not current:
        raise HTTPException(status_code=401, detail='Not authenticated')
    return current


def is_mutual_follow(conn: sqlite3.Connection, user_a: str, user_b: str) -> bool:
    a_id = get_user_id(conn, user_a)
    b_id = get_user_id(conn, user_b)
    row = conn.execute(
        """
        SELECT 1
        FROM follows f1
        JOIN follows f2 ON f1.follower_id = f2.followee_id AND f1.followee_id = f2.follower_id
        WHERE f1.follower_id = ? AND f1.followee_id = ?
        """,
        (a_id, b_id),
    ).fetchone()
    return bool(row)


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

-- Conversations abstraction for DM + group chats
CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK(type IN ('dm','group')),
    title TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_activity_at TEXT
);

CREATE TABLE IF NOT EXISTS conversation_participants (
    conversation_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT DEFAULT 'member',
    last_read_at TEXT,
    PRIMARY KEY (conversation_id, user_id),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_conv_part_user ON conversation_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last_activity ON conversations(last_activity_at);
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
        # Read session username from cookie set by our auth endpoints
        username = request_context.get_cookie("session_user")
        if not username:
            raise ValueError("Missing 'session_user' cookie for user identification")

        return User(id=username, email=f"{username}@example.com", group_memberships=["user"])

# =========================================================
# 5) Build FastAPI + mount Vanna server
# =========================================================
init_db(DB_PATH)

# Ensure users table has a password_hash column (migrate if needed)
conn = sqlite3.connect(DB_PATH)
try:
    cols = [r[1] for r in conn.execute("PRAGMA table_info(users)").fetchall()]
    if 'password_hash' not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN password_hash TEXT")
        conn.commit()
finally:
    conn.close()

app = FastAPI(title="Chat Group App + Vanna", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=True,
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
DEEPSEEK_API_KEY = "sk-5464b8958c224207a77e1bd9ef161343" #os.getenv("DEEPSEEK_API_KEY", "").strip()

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

# Ensure uploads directory exists and serve it
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), 'uploads')
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount('/uploads', StaticFiles(directory=UPLOAD_DIR), name='uploads')

# Create follows table if missing (asymmetric follow model)
conn = get_conn()
try:
        conn.execute('''
        CREATE TABLE IF NOT EXISTS follows (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            follower_id INTEGER NOT NULL,
            followee_id INTEGER NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(follower_id, followee_id),
            FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (followee_id) REFERENCES users(id) ON DELETE CASCADE
        );
        ''')
        conn.commit()
finally:
        conn.close()

# Create follow requests table if missing
conn = get_conn()
try:
    conn.execute('''
    CREATE TABLE IF NOT EXISTS follow_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        requester_id INTEGER NOT NULL,
        target_id INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(requester_id, target_id),
        FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (target_id) REFERENCES users(id) ON DELETE CASCADE
    );
    ''')
    conn.commit()
finally:
    conn.close()

# Create comments table if missing
conn = get_conn()
try:
        conn.execute('''
        CREATE TABLE IF NOT EXISTS comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        ''')
        conn.commit()
finally:
        conn.close()

# Ensure a 'global' group exists for the public feed
conn = get_conn()
try:
    row = conn.execute("SELECT id FROM groups WHERE name = ?", ('global',)).fetchone()
    if not row:
        conn.execute("INSERT INTO groups (name, description) VALUES (?, ?)", ('global', 'Global public feed'))
        conn.commit()
finally:
    conn.close()


# =========================================================
# 6) REST endpoints for chat app
# =========================================================
@app.get("/health")
def health():
    return {"ok": True, "db_path": DB_PATH}


class RegisterReq(BaseModel):
    username: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=6)
    display_name: Optional[str] = Field(None, max_length=128)
    avatar_url: Optional[str] = Field(None, max_length=512)


@app.post('/auth/register')
def auth_register(req: RegisterReq, response: Response, request: Request):
    check_rate_limit(request, "auth_register", limit=10, window_sec=60)
    conn = get_conn()
    try:
        req.username = sanitize_text(req.username, 64) or ""
        req.display_name = sanitize_text(req.display_name, 128)
        req.avatar_url = sanitize_text(req.avatar_url, 512)
        if not req.username:
            raise HTTPException(status_code=400, detail="Username required")
        # check username
        existing = conn.execute('SELECT id FROM users WHERE username = ?', (req.username,)).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail='Username already exists')

        # bcrypt has a 72-byte input limit; truncate UTF-8 bytes safely
        pw_bytes = req.password.encode('utf-8')[:72]
        pw_trunc = pw_bytes.decode('utf-8', errors='ignore')
        password_hash = pwd_hasher.hash(pw_trunc)
        conn.execute(
            'INSERT INTO users (username, display_name, avatar_url, password_hash) VALUES (?, ?, ?, ?)',
            (req.username, req.display_name or req.username, req.avatar_url, password_hash)
        )
        user_id = conn.execute('SELECT last_insert_rowid() as id').fetchone()['id']
        conn.execute('INSERT INTO user_profiles (user_id) VALUES (?)', (user_id,))
        # ensure global group and add membership
        row = conn.execute("SELECT id FROM groups WHERE name = ?", ('global',)).fetchone()
        if row:
            gid = int(row['id'])
        else:
            conn.execute("INSERT INTO groups (name, description) VALUES (?, ?)", ('global', 'Global public feed'))
            gid = conn.execute("SELECT last_insert_rowid() as id").fetchone()['id']
        try:
            conn.execute("INSERT INTO group_members (group_id, user_id) VALUES (?, ?)", (gid, user_id))
        except sqlite3.IntegrityError:
            pass
        conn.commit()
        # set session cookie
        # Set session cookie. For local development `secure=False` (HTTP).
        # In production behind HTTPS set `secure=True` and tighten `max_age` as needed.
        response.set_cookie(
            'session_user',
            req.username,
            httponly=True,
            samesite='lax',
            max_age=60 * 60 * 24 * 7,
            path='/',
            secure=False,
        )
        return {'ok': True, 'username': req.username}
    finally:
        conn.close()


class LoginReq(BaseModel):
    username: str
    password: str


@app.post('/auth/login')
def auth_login(req: LoginReq, response: Response, request: Request):
    check_rate_limit(request, "auth_login", limit=20, window_sec=60)
    conn = get_conn()
    try:
        req.username = sanitize_text(req.username, 64) or ""
        if not req.username:
            raise HTTPException(status_code=400, detail="Username required")
        row = conn.execute('SELECT password_hash FROM users WHERE username = ?', (req.username,)).fetchone()
        if not row or not row['password_hash']:
            raise HTTPException(status_code=401, detail='Invalid username or password')
        pw_hash = row['password_hash']
        # truncate provided password bytes to bcrypt limit before verify
        pw_bytes = req.password.encode('utf-8')[:72]
        pw_trunc = pw_bytes.decode('utf-8', errors='ignore')
        if not pwd_hasher.verify(pw_trunc, pw_hash):
            raise HTTPException(status_code=401, detail='Invalid username or password')
        response.set_cookie(
            'session_user',
            req.username,
            httponly=True,
            samesite='lax',
            max_age=60 * 60 * 24 * 7,
            path='/',
            secure=False,
        )

        # ensure global group membership on login
        row = conn.execute("SELECT id FROM groups WHERE name = ?", ('global',)).fetchone()
        if row:
            gid = int(row['id'])
            user_id = get_user_id(conn, req.username)
            try:
                conn.execute("INSERT INTO group_members (group_id, user_id) VALUES (?, ?)", (gid, user_id))
                conn.commit()
            except sqlite3.IntegrityError:
                pass

        return {'ok': True, 'username': req.username}
    finally:
        conn.close()


@app.post('/auth/logout')
def auth_logout(response: Response, request: Request):
    check_rate_limit(request, "auth_logout", limit=30, window_sec=60)
    # Clear the session cookie
    response.delete_cookie('session_user', path='/')
    return {'ok': True}


@app.get('/auth/me')
def auth_me(request: Request):
    current = request.cookies.get('session_user')
    if not current:
        raise HTTPException(status_code=401, detail='Not authenticated')
    conn = get_conn()
    try:
        user_id = get_user_id(conn, current)
        return get_user_info(conn, user_id)
    finally:
        conn.close()


@app.post("/users")
def create_user(req: CreateUserReq, request: Request):
    check_rate_limit(request, "create_user", limit=20, window_sec=60)
    conn = get_conn()
    try:
        try:
            req.username = sanitize_text(req.username, 64) or ""
            req.display_name = sanitize_text(req.display_name, 128)
            req.avatar_url = sanitize_text(req.avatar_url, 512)
            if not req.username:
                raise HTTPException(status_code=400, detail="Username required")
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
def list_users(query: Optional[str] = None):
    conn = get_conn()
    try:
        if query:
            query = sanitize_text(query, 128)
            q = f"%{query}%"
            rows = conn.execute("""
                SELECT u.id, u.username, u.display_name, u.avatar_url, 
                       up.bio, up.website, up.location, u.created_at,
                       COUNT(m.id) as post_count
                FROM users u
                LEFT JOIN user_profiles up ON u.id = up.user_id
                LEFT JOIN messages m ON u.id = m.user_id
                WHERE u.username LIKE ? OR u.display_name LIKE ?
                GROUP BY u.id
                ORDER BY u.created_at DESC
            """, (q, q)).fetchall()
        else:
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


@app.get("/users/{username}/messages", response_model=List[MessageOut])
def list_user_messages(username: str, limit: int = 50, request: Request = None):
    if limit < 1 or limit > 500:
        raise HTTPException(status_code=400, detail="limit must be between 1 and 500")
    conn = get_conn()
    try:
        uid = get_user_id(conn, username)
        rows = conn.execute(
            """
            SELECT m.id, m.group_id, u.username, u.display_name, u.avatar_url,
                   m.content, m.image_url, m.created_at
            FROM messages m
            JOIN users u ON u.id = m.user_id
            WHERE m.user_id = ?
            ORDER BY m.created_at DESC
            LIMIT ?
            """,
            (uid, limit),
        ).fetchall()

        current = None
        if request:
            current = request.cookies.get('session_user')

        messages = []
        for row in rows:
            msg = dict(row)
            like_info = get_message_like_info(conn, msg['id'], current)
            msg['like_count'] = like_info['like_count']
            msg['liked_by_current_user'] = like_info['liked_by_user']
            messages.append(MessageOut(**msg))
        return messages
    finally:
        conn.close()


@app.get('/users/{username}/followers')
def list_followers(username: str, request: Request):
    check_rate_limit(request, "list_followers", limit=120, window_sec=60)
    conn = get_conn()
    try:
        username = sanitize_text(username, 64) or ""
        if not username:
            raise HTTPException(status_code=400, detail="Username required")
        uid = get_user_id(conn, username)
        rows = conn.execute('''
            SELECT u.id, u.username, u.display_name, u.avatar_url, up.bio, f.created_at
            FROM follows f
            JOIN users u ON u.id = f.follower_id
            LEFT JOIN user_profiles up ON u.id = up.user_id
            WHERE f.followee_id = ?
            ORDER BY f.created_at DESC
        ''', (uid,)).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@app.get('/users/{username}/following')
def list_following(username: str, request: Request):
    check_rate_limit(request, "list_following", limit=120, window_sec=60)
    conn = get_conn()
    try:
        username = sanitize_text(username, 64) or ""
        if not username:
            raise HTTPException(status_code=400, detail="Username required")
        uid = get_user_id(conn, username)
        rows = conn.execute('''
            SELECT u.id, u.username, u.display_name, u.avatar_url, up.bio, f.created_at
            FROM follows f
            JOIN users u ON u.id = f.followee_id
            LEFT JOIN user_profiles up ON u.id = up.user_id
            WHERE f.follower_id = ?
            ORDER BY f.created_at DESC
        ''', (uid,)).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@app.post('/users/{username}/follow')
def follow_user(username: str, request: Request):
    check_rate_limit(request, "follow_user", limit=60, window_sec=60)
    current = request.cookies.get('session_user')
    if not current:
        raise HTTPException(status_code=401, detail='Not authenticated')
    conn = get_conn()
    try:
        username = sanitize_text(username, 64) or ""
        if not username:
            raise HTTPException(status_code=400, detail="Username required")
        follower_id = get_user_id(conn, current)
        followee_id = get_user_id(conn, username)
        if follower_id == followee_id:
            raise HTTPException(status_code=400, detail='Cannot follow yourself')
        # If already following, no-op
        row = conn.execute(
            "SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?",
            (follower_id, followee_id),
        ).fetchone()
        if row:
            return {"ok": True, "status": "already_following"}

        # Create follow request
        try:
            conn.execute(
                "INSERT INTO follow_requests (requester_id, target_id) VALUES (?, ?)",
                (follower_id, followee_id)
            )
            conn.commit()
        except sqlite3.IntegrityError:
            pass
        return {"ok": True, "status": "requested"}
    finally:
        conn.close()


@app.post('/users/{username}/unfollow')
def unfollow_user(username: str, request: Request):
    check_rate_limit(request, "unfollow_user", limit=60, window_sec=60)
    current = request.cookies.get('session_user')
    if not current:
        raise HTTPException(status_code=401, detail='Not authenticated')
    conn = get_conn()
    try:
        username = sanitize_text(username, 64) or ""
        if not username:
            raise HTTPException(status_code=400, detail="Username required")
        follower_id = get_user_id(conn, current)
        followee_id = get_user_id(conn, username)
        conn.execute(
            "DELETE FROM follows WHERE follower_id = ? AND followee_id = ?",
            (follower_id, followee_id)
        )
        conn.execute(
            "DELETE FROM follow_requests WHERE requester_id = ? AND target_id = ?",
            (follower_id, followee_id)
        )
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@app.get('/follow/requests/incoming')
def list_follow_requests_incoming(request: Request):
    current = get_current_user(request)
    conn = get_conn()
    try:
        uid = get_user_id(conn, current)
        rows = conn.execute(
            """
            SELECT u.id, u.username, u.display_name, u.avatar_url, fr.created_at
            FROM follow_requests fr
            JOIN users u ON u.id = fr.requester_id
            WHERE fr.target_id = ?
            ORDER BY fr.created_at DESC
            """,
            (uid,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@app.get('/follow/requests/outgoing')
def list_follow_requests_outgoing(request: Request):
    current = get_current_user(request)
    conn = get_conn()
    try:
        uid = get_user_id(conn, current)
        rows = conn.execute(
            """
            SELECT u.id, u.username, u.display_name, u.avatar_url, fr.created_at
            FROM follow_requests fr
            JOIN users u ON u.id = fr.target_id
            WHERE fr.requester_id = ?
            ORDER BY fr.created_at DESC
            """,
            (uid,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@app.post('/follow/requests/{username}/accept')
def accept_follow_request(username: str, request: Request):
    current = get_current_user(request)
    conn = get_conn()
    try:
        username = sanitize_text(username, 64) or ""
        if not username:
            raise HTTPException(status_code=400, detail="Username required")
        requester_id = get_user_id(conn, username)
        target_id = get_user_id(conn, current)

        # ensure request exists
        row = conn.execute(
            "SELECT 1 FROM follow_requests WHERE requester_id = ? AND target_id = ?",
            (requester_id, target_id),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Follow request not found")

        # create follow
        try:
            conn.execute(
                "INSERT INTO follows (follower_id, followee_id) VALUES (?, ?)",
                (requester_id, target_id)
            )
        except sqlite3.IntegrityError:
            pass

        conn.execute(
            "DELETE FROM follow_requests WHERE requester_id = ? AND target_id = ?",
            (requester_id, target_id),
        )
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@app.post('/follow/requests/{username}/decline')
def decline_follow_request(username: str, request: Request):
    current = get_current_user(request)
    conn = get_conn()
    try:
        username = sanitize_text(username, 64) or ""
        if not username:
            raise HTTPException(status_code=400, detail="Username required")
        requester_id = get_user_id(conn, username)
        target_id = get_user_id(conn, current)
        conn.execute(
            "DELETE FROM follow_requests WHERE requester_id = ? AND target_id = ?",
            (requester_id, target_id),
        )
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@app.post('/dm/{username}')
def create_dm(username: str, request: Request):
    """Create or fetch a DM group between current user and a mutual follower."""
    check_rate_limit(request, "create_dm", limit=30, window_sec=60)
    current = get_current_user(request)
    conn = get_conn()
    try:
        username = sanitize_text(username, 64) or ""
        if not username:
            raise HTTPException(status_code=400, detail="Username required")
        if not is_mutual_follow(conn, current, username):
            raise HTTPException(status_code=403, detail="Mutual follow required")

        # stable dm group name
        a, b = sorted([current, username])
        group_name = f"dm:{a}:{b}"

        row = conn.execute("SELECT id, name, description, created_at FROM groups WHERE name = ?", (group_name,)).fetchone()
        if not row:
            conn.execute("INSERT INTO groups (name, description) VALUES (?, ?)", (group_name, "Direct message"))
            gid = conn.execute("SELECT last_insert_rowid() as id").fetchone()["id"]
        else:
            gid = int(row["id"])

        # ensure membership for both
        a_id = get_user_id(conn, current)
        b_id = get_user_id(conn, username)
        for uid in (a_id, b_id):
            try:
                conn.execute("INSERT INTO group_members (group_id, user_id) VALUES (?, ?)", (gid, uid))
            except sqlite3.IntegrityError:
                pass
        conn.commit()

        group = conn.execute("SELECT id, name, description, created_at FROM groups WHERE id = ?", (gid,)).fetchone()
        return dict(group)
    finally:
        conn.close()


@app.get('/feed', response_model=List[MessageOut])
def get_feed(
    following: Optional[int] = 0,
    limit: int = 50,
    before: Optional[str] = None,
    request: Request = None,
):
    current = None
    if request:
        current = request.cookies.get('session_user')
    if not current:
        raise HTTPException(status_code=401, detail='Not authenticated')
    if limit < 1 or limit > 500:
        raise HTTPException(status_code=400, detail='limit must be between 1 and 500')

    conn = get_conn()
    try:
        if following:
            # need current user
            try:
                uid = get_user_id(conn, current)
            except HTTPException:
                raise HTTPException(status_code=401, detail='Invalid user')

            rows = conn.execute('''
                SELECT m.id, m.group_id, u.username, u.display_name, u.avatar_url,
                       m.content, m.image_url, m.created_at
                FROM messages m
                JOIN users u ON u.id = m.user_id
                WHERE m.user_id IN (
                    SELECT followee_id FROM follows WHERE follower_id = ?
                )
                AND (? IS NULL OR m.created_at < ?)
                ORDER BY m.created_at DESC
                LIMIT ?
            ''', (uid, before, before, limit)).fetchall()
        else:
            # default: global group messages
            try:
                gid = get_group_id(conn, 'global')
            except HTTPException:
                return []
            rows = conn.execute('''
                SELECT m.id, m.group_id, u.username, u.display_name, u.avatar_url,
                       m.content, m.image_url, m.created_at
                FROM messages m
                JOIN users u ON u.id = m.user_id
                WHERE m.group_id = ?
                AND (? IS NULL OR m.created_at < ?)
                ORDER BY m.created_at DESC
                LIMIT ?
            ''', (gid, before, before, limit)).fetchall()

        messages = []
        for row in rows:
            msg = dict(row)
            like_info = get_message_like_info(conn, msg['id'], current)
            msg['like_count'] = like_info['like_count']
            msg['liked_by_current_user'] = like_info['liked_by_user']
            messages.append(MessageOut(**msg))
        return messages
    finally:
        conn.close()


@app.put("/users/{username}/profile")
def update_user_profile(username: str, req: UpdateUserProfileReq, request: Request):
    check_rate_limit(request, "update_profile", limit=30, window_sec=60)
    conn = get_conn()
    try:
        req.display_name = sanitize_text(req.display_name, 128)
        req.bio = sanitize_text(req.bio, 500)
        req.website = sanitize_text(req.website, 256)
        req.location = sanitize_text(req.location, 128)
        req.avatar_url = sanitize_text(req.avatar_url, 512)
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
def create_group(req: CreateGroupReq, request: Request):
    check_rate_limit(request, "create_group", limit=20, window_sec=60)
    current = get_current_user(request)
    conn = get_conn()
    try:
        try:
            req.name = sanitize_text(req.name, 128) or ""
            req.description = sanitize_text(req.description, 500)
            if not req.name:
                raise HTTPException(status_code=400, detail="Group name required")
            conn.execute(
                "INSERT INTO groups (name, description) VALUES (?, ?)",
                (req.name, req.description)
            )
            conn.commit()
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=409, detail="Group name already exists")
        row = conn.execute("SELECT id, name, description, created_at FROM groups WHERE name = ?", (req.name,)).fetchone()
        # add creator as member
        try:
            gid = int(row["id"])
            uid = get_user_id(conn, current)
            conn.execute("INSERT INTO group_members (group_id, user_id) VALUES (?, ?)", (gid, uid))
            conn.commit()
        except Exception:
            pass
        return dict(row)
    finally:
        conn.close()


@app.post("/upload")
async def upload_file(file: UploadFile = File(...), request: Request = None):
    check_rate_limit(request, "upload", limit=30, window_sec=60)
    if not file or not file.filename:
        raise HTTPException(status_code=400, detail="File required")

    allowed_types = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/gif": ".gif",
        "image/webp": ".webp",
    }
    content_type = (file.content_type or "").lower()
    ext = allowed_types.get(content_type)
    if not ext:
        # fallback to filename extension if content_type is missing
        _, raw_ext = os.path.splitext(file.filename)
        raw_ext = raw_ext.lower()
        if raw_ext in [".jpg", ".jpeg", ".png", ".gif", ".webp"]:
            ext = ".jpg" if raw_ext == ".jpeg" else raw_ext
        else:
            raise HTTPException(status_code=400, detail="Unsupported file type")

    data = await file.read()
    max_bytes = 5 * 1024 * 1024
    if len(data) > max_bytes:
        raise HTTPException(status_code=400, detail="File too large (max 5MB)")

    filename = f"{uuid.uuid4().hex}{ext}"
    dest_path = os.path.join(UPLOAD_DIR, filename)
    with open(dest_path, "wb") as f:
        f.write(data)

    return {"url": f"/uploads/{filename}"}


@app.get("/groups")
def list_groups(request: Request):
    current = get_current_user(request)
    conn = get_conn()
    try:
        uid = get_user_id(conn, current)
        rows = conn.execute("""
            SELECT g.id, g.name, g.description, g.created_at,
                   COUNT(gm2.user_id) as member_count
            FROM groups g
            JOIN group_members gm ON g.id = gm.group_id
            LEFT JOIN group_members gm2 ON g.id = gm2.group_id
            WHERE gm.user_id = ?
            GROUP BY g.id
            ORDER BY g.created_at DESC
        """, (uid,)).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@app.post("/groups/{group_name}/members")
def add_member(group_name: str, req: AddMemberReq, request: Request):
    check_rate_limit(request, "add_member", limit=60, window_sec=60)
    current = get_current_user(request)
    conn = get_conn()
    try:
        group_name = sanitize_text(group_name, 128) or ""
        req.username = sanitize_text(req.username, 64) or ""
        req.role = sanitize_text(req.role, 32) or "member"
        if not group_name or not req.username:
            raise HTTPException(status_code=400, detail="Group and username required")
        gid = get_group_id(conn, group_name)
        inviter_id = get_user_id(conn, current)
        uid = get_user_id(conn, req.username)
        # inviter must be a group member
        mem = conn.execute(
            "SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?",
            (gid, inviter_id),
        ).fetchone()
        if not mem:
            raise HTTPException(status_code=403, detail="Inviter is not a member of this group")
        # inviter and invitee must be mutual followers
        if not is_mutual_follow(conn, current, req.username):
            raise HTTPException(status_code=403, detail="Can only invite mutual followers")
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


@app.get("/groups/{group_name}/members")
def list_group_members(group_name: str, request: Request):
    current = get_current_user(request)
    conn = get_conn()
    try:
        group_name = sanitize_text(group_name, 128) or ""
        if not group_name:
            raise HTTPException(status_code=400, detail="Group name required")
        gid = get_group_id(conn, group_name)
        uid = get_user_id(conn, current)
        mem = conn.execute(
            "SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?",
            (gid, uid),
        ).fetchone()
        if not mem:
            raise HTTPException(status_code=403, detail="Not a group member")

        rows = conn.execute(
            """
            SELECT u.id, u.username, u.display_name, u.avatar_url, gm.role, gm.joined_at
            FROM group_members gm
            JOIN users u ON u.id = gm.user_id
            WHERE gm.group_id = ?
            ORDER BY gm.joined_at ASC
            """,
            (gid,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@app.post("/groups/{group_name}/messages")
def send_message(group_name: str, req: SendMessageReq, request: Request):
    check_rate_limit(request, "send_message", limit=120, window_sec=60)
    current = get_current_user(request)
    group_name = sanitize_text(group_name, 128) or ""
    req.username = sanitize_text(req.username, 64) or ""
    req.content = sanitize_text(req.content, 2000)
    req.image_url = sanitize_text(req.image_url, 1024)
    if not group_name or not req.username:
        raise HTTPException(status_code=400, detail="Group and username required")
    if req.username != current:
        raise HTTPException(status_code=403, detail="Username does not match session")
    if (req.content is None or req.content.strip() == "") and (req.image_url is None or req.image_url.strip() == ""):
        raise HTTPException(status_code=400, detail="Either content or image_url must be provided")

    conn = get_conn()
    try:
        # Ensure group exists (create if missing)
        try:
            gid = get_group_id(conn, group_name)
            group_exists = True
        except HTTPException:
            conn.execute("INSERT INTO groups (name, description) VALUES (?, ?)", (group_name, None))
            gid = conn.execute("SELECT last_insert_rowid() as id").fetchone()["id"]
            group_exists = False

        uid = get_user_id(conn, req.username)

        # ensure membership; only auto-add if group newly created
        mem = conn.execute(
            "SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?",
            (gid, uid),
        ).fetchone()
        if not mem:
            if group_exists:
                raise HTTPException(status_code=403, detail="Not a group member")
            try:
                conn.execute("INSERT INTO group_members (group_id, user_id) VALUES (?, ?)", (gid, uid))
            except sqlite3.IntegrityError:
                pass

        # ensure there is a conversation for this group and insert message tied to it
        conv_row = conn.execute("SELECT conversation_id FROM groups WHERE id = ?", (gid,)).fetchone()
        conv_id = conv_row["conversation_id"] if conv_row else None
        if not conv_id:
            conn.execute("INSERT INTO conversations (type, title) VALUES ('group', ?)", (group_name,))
            conv_id = conn.execute("SELECT last_insert_rowid() as id").fetchone()["id"]
            conn.execute("UPDATE groups SET conversation_id = ? WHERE id = ?", (conv_id, gid))

        # Try to insert both group_id and conversation_id (conversation column added by migration)
        try:
            conn.execute(
                "INSERT INTO messages (group_id, conversation_id, user_id, content, image_url) VALUES (?, ?, ?, ?, ?)",
                (gid, conv_id, uid, req.content, req.image_url),
            )
        except sqlite3.OperationalError:
            # older DB without conversation_id column: fall back
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
    request: Request = None,
):
    if limit < 1 or limit > 500:
        raise HTTPException(status_code=400, detail="limit must be between 1 and 500")

    # must be authenticated and a member of the group
    if not request:
        raise HTTPException(status_code=401, detail="Not authenticated")
    current = get_current_user(request)

    conn = get_conn()
    try:
        gid = get_group_id(conn, group_name)
        uid = get_user_id(conn, current)
        mem = conn.execute(
            "SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?",
            (gid, uid),
        ).fetchone()
        if not mem:
            raise HTTPException(status_code=403, detail="Not a group member")

        # determine conversation id for this group (if exists)
        conv_row = conn.execute("SELECT conversation_id FROM groups WHERE id = ?", (gid,)).fetchone()
        conv_id = conv_row["conversation_id"] if conv_row else None

        where = []
        params = []
        if conv_id:
            where.append("(m.group_id = ? OR m.conversation_id = ?)")
            params.extend([gid, conv_id])
        else:
            where.append("m.group_id = ?")
            params.append(gid)

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
def like_message(message_id: int, req: LikeMessageReq, request: Request):
    check_rate_limit(request, "like_message", limit=200, window_sec=60)
    conn = get_conn()
    try:
        req.username = sanitize_text(req.username, 64) or ""
        if not req.username:
            raise HTTPException(status_code=400, detail="Username required")
        uid = get_user_id(conn, req.username)
        
        # Check if message exists and determine its conversation/group
        message_row = conn.execute(
            "SELECT id, group_id, conversation_id FROM messages WHERE id = ?",
            (message_id,)
        ).fetchone()
        if not message_row:
            raise HTTPException(status_code=404, detail="Message not found")

        # If message belongs to a conversation, check conversation participants
        conv_id = message_row.get("conversation_id") if message_row else None
        if conv_id:
            mem = conn.execute(
                "SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?",
                (conv_id, uid),
            ).fetchone()
            if not mem:
                raise HTTPException(status_code=403, detail="User is not a participant in this conversation")
        else:
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


@app.post('/messages/{message_id}/comments')
def add_comment(message_id: int, req: SendMessageReq, request: Request):
    check_rate_limit(request, "add_comment", limit=120, window_sec=60)
    # reuse SendMessageReq fields: username + content
    current = get_current_user(request)
    req.username = sanitize_text(req.username, 64) or ""
    req.content = sanitize_text(req.content, 2000)
    if not req.username:
        raise HTTPException(status_code=400, detail="Username required")
    if req.username != current:
        raise HTTPException(status_code=403, detail="Username does not match session")
    if not req.content or req.content.strip() == "":
        raise HTTPException(status_code=400, detail='Comment content required')
    conn = get_conn()
    try:
        # check message exists
        msg = conn.execute('SELECT id FROM messages WHERE id = ?', (message_id,)).fetchone()
        if not msg:
            raise HTTPException(status_code=404, detail='Message not found')
        uid = get_user_id(conn, req.username)
        conn.execute('INSERT INTO comments (message_id, user_id, content) VALUES (?, ?, ?)', (message_id, uid, req.content))
        conn.commit()
        row = conn.execute('''
            SELECT c.id, c.message_id, u.username, u.display_name, u.avatar_url, c.content, c.created_at
            FROM comments c JOIN users u ON u.id = c.user_id
            WHERE c.rowid = last_insert_rowid()
        ''').fetchone()
        return dict(row)
    finally:
        conn.close()


@app.get('/messages/{message_id}/comments')
def list_comments(message_id: int, limit: int = 100, before: Optional[str] = None, request: Request = None):
    # require auth to view comments
    if not request:
        raise HTTPException(status_code=401, detail='Not authenticated')
    get_current_user(request)
    conn = get_conn()
    try:
        rows = conn.execute('''
            SELECT c.id, c.message_id, u.username, u.display_name, u.avatar_url, c.content, c.created_at
            FROM comments c JOIN users u ON u.id = c.user_id
            WHERE c.message_id = ?
            AND (? IS NULL OR c.created_at < ?)
            ORDER BY c.created_at ASC
            LIMIT ?
        ''', (message_id, before, before, limit)).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@app.delete('/comments/{comment_id}')
def delete_comment(comment_id: int, request: Request):
    check_rate_limit(request, "delete_comment", limit=60, window_sec=60)
    current = request.cookies.get('session_user')
    if not current:
        raise HTTPException(status_code=401, detail='Not authenticated')
    conn = get_conn()
    try:
        row = conn.execute('SELECT id, user_id FROM comments WHERE id = ?', (comment_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail='Comment not found')
        author_id = int(row['user_id'])
        current_id = get_user_id(conn, current)
        if current_id != author_id:
            raise HTTPException(status_code=403, detail='Not allowed')
        conn.execute('DELETE FROM comments WHERE id = ?', (comment_id,))
        conn.commit()
        return {'ok': True}
    finally:
        conn.close()


# Simple in-memory room -> set(WebSocket) registry for broadcasting
ROOMS: Dict[str, List[WebSocket]] = {}


@app.websocket('/ws')
async def websocket_endpoint(websocket: WebSocket):
    # Expect query param 'room'
    await websocket.accept()
    room = websocket.query_params.get('room') or 'global'
    # require auth and membership
    current = websocket.cookies.get('session_user')
    if not current:
        await websocket.close(code=1008)
        return
    conn = get_conn()
    try:
        try:
            gid = get_group_id(conn, room)
            uid = get_user_id(conn, current)
            mem = conn.execute(
                "SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?",
                (gid, uid),
            ).fetchone()
            if not mem:
                await websocket.close(code=1008)
                return
        except HTTPException:
            await websocket.close(code=1008)
            return
    finally:
        conn.close()
    ROOMS.setdefault(room, [])
    ROOMS[room].append(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # Try to parse JSON, but accept plain text
            try:
                import json
                payload = json.loads(data)
            except Exception:
                payload = {'type': 'message', 'content': data}

            # Attach sender info from cookie if available
            sender = websocket.cookies.get('session_user') or payload.get('username') or 'anon'

            # Persist to DB if it's a message
            if payload.get('type') == 'message':
                conn = get_conn()
                try:
                    # Ensure group exists
                    group_name = room
                    row = conn.execute('SELECT id FROM groups WHERE name = ?', (group_name,)).fetchone()
                    if row:
                        gid = int(row['id'])
                    else:
                        conn.execute('INSERT INTO groups (name, description) VALUES (?, ?)', (group_name, None))
                        gid = conn.execute('SELECT last_insert_rowid() as id').fetchone()['id']
                    # Ensure user exists and is a member
                    try:
                        uid = get_user_id(conn, sender)
                    except HTTPException:
                        uid = None
                    if uid:
                        # Add membership if missing
                        mem = conn.execute('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?', (gid, uid)).fetchone()
                        if not mem:
                            try:
                                conn.execute('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)', (gid, uid))
                            except sqlite3.IntegrityError:
                                pass
                        conn.execute('INSERT INTO messages (group_id, user_id, content) VALUES (?, ?, ?)', (gid, uid, payload.get('content')))
                        conn.commit()
                finally:
                    conn.close()

            # Broadcast to room
            to_remove = []
            for ws in list(ROOMS.get(room, [])):
                try:
                    await ws.send_text(json.dumps({**(payload if isinstance(payload, dict) else {}), 'user': sender}))
                except Exception:
                    to_remove.append(ws)
            for ws in to_remove:
                if ws in ROOMS.get(room, []):
                    ROOMS[room].remove(ws)
    except WebSocketDisconnect:
        if websocket in ROOMS.get(room, []):
            ROOMS[room].remove(websocket)


# =========================================================
# 7) Entrypoint
# =========================================================
if __name__ == "__main__":
    # Use uvicorn so everything runs in one server.
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)