import os
import sqlite3
import sys
from werkzeug.security import generate_password_hash, check_password_hash

def get_db_path():
    """Resolve a persistent path for the SQLite users database."""
    if getattr(sys, 'frozen', False):
        app_dir = os.path.dirname(sys.executable)
    else:
        app_dir = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(app_dir, 'users.db')

def get_db_connection():
    """Connect to SQLite database and configure row factory."""
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Create the users and user_settings tables if they do not exist."""
    conn = get_db_connection()
    try:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        conn.execute('''
            CREATE TABLE IF NOT EXISTS user_settings (
                user_id INTEGER PRIMARY KEY,
                end_screen_enabled INTEGER DEFAULT 0,
                end_screen_path TEXT,
                end_screen_duration REAL DEFAULT 3.0,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
        ''')
        conn.commit()
        print("[*] SQLite Database initialized successfully.")
    except Exception as e:
        print(f"[!] Error initializing database: {e}")
    finally:
        conn.close()

def get_user_settings(user_id):
    """Retrieve settings for a user. Seeds default settings if none exist."""
    conn = get_db_connection()
    try:
        row = conn.execute(
            'SELECT end_screen_enabled, end_screen_path, end_screen_duration FROM user_settings WHERE user_id = ?',
            (user_id,)
        ).fetchone()
        
        if row:
            return {
                'end_screen_enabled': bool(row['end_screen_enabled']),
                'end_screen_path': row['end_screen_path'] or '',
                'end_screen_duration': row['end_screen_duration']
            }
        else:
            # Seed default settings
            conn.execute(
                'INSERT INTO user_settings (user_id, end_screen_enabled, end_screen_path, end_screen_duration) VALUES (?, 0, "", 3.0)',
                (user_id,)
            )
            conn.commit()
            return {
                'end_screen_enabled': False,
                'end_screen_path': '',
                'end_screen_duration': 3.0
            }
    except Exception as e:
        print(f"[!] Error retrieving settings for user {user_id}: {e}")
        return {
            'end_screen_enabled': False,
            'end_screen_path': '',
            'end_screen_duration': 3.0
        }
    finally:
        conn.close()

def save_user_settings(user_id, enabled, path, duration):
    """Save settings for a user permanently. Returns True on success."""
    conn = get_db_connection()
    try:
        conn.execute('''
            INSERT OR REPLACE INTO user_settings (user_id, end_screen_enabled, end_screen_path, end_screen_duration)
            VALUES (?, ?, ?, ?)
        ''', (user_id, 1 if enabled else 0, path, duration))
        conn.commit()
        return True
    except Exception as e:
        print(f"[!] Error saving settings for user {user_id}: {e}")
        return False
    finally:
        conn.close()


def create_user(username, password):
    """Hash password and create a new user account. Returns True on success, False if user exists."""
    username = username.strip().lower()
    if not username or not password:
        return False
        
    pw_hash = generate_password_hash(password)
    
    conn = get_db_connection()
    try:
        conn.execute(
            'INSERT INTO users (username, password_hash) VALUES (?, ?)',
            (username, pw_hash)
        )
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        # Username already exists
        return False
    except Exception as e:
        print(f"[!] Error creating user: {e}")
        return False
    finally:
        conn.close()

def verify_user(username, password):
    """Verify password hash. Returns user dict on success, None on failure."""
    username = username.strip().lower()
    if not username or not password:
        return None
        
    conn = get_db_connection()
    try:
        row = conn.execute(
            'SELECT id, username, password_hash FROM users WHERE username = ?',
            (username,)
        ).fetchone()
        
        if row and check_password_hash(row['password_hash'], password):
            return {
                'id': row['id'],
                'username': row['username']
            }
        return None
    except Exception as e:
        print(f"[!] Error verifying user: {e}")
        return None
    finally:
        conn.close()
