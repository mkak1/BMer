import sqlite3
from pathlib import Path

from flask import current_app, g


DEFAULT_CATEGORIES = [
    ("Design", "#8b5cf6"),
    ("Development", "#38bdf8"),
    ("Productivity", "#34d399"),
    ("Learning", "#fbbf24"),
]

DEFAULT_BOOKMARKS = [
    ("Figma", "https://www.figma.com", "Design"),
    ("Dribbble", "https://dribbble.com", "Design"),
    ("MDN", "https://developer.mozilla.org", "Development"),
    ("GitHub", "https://github.com", "Development"),
    ("Notion", "https://www.notion.so", "Productivity"),
    ("Obsidian", "https://obsidian.md", "Productivity"),
    ("Coursera", "https://www.coursera.org", "Learning"),
    ("YouTube Learning", "https://www.youtube.com", "Learning"),
]


def get_db():
    if "db" not in g:
        database_path = Path(current_app.config["DATABASE"])
        database_path.parent.mkdir(parents=True, exist_ok=True)
        g.db = sqlite3.connect(database_path)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


def close_db(_error=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    db = get_db()
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE COLLATE NOCASE,
            color TEXT NOT NULL,
            position INTEGER NOT NULL DEFAULT 0,
            collapsed INTEGER NOT NULL DEFAULT 0 CHECK (collapsed IN (0, 1))
        );

        CREATE TABLE IF NOT EXISTS bookmarks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            url TEXT NOT NULL,
            category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        """
    )

    category_count = db.execute("SELECT COUNT(*) FROM categories").fetchone()[0]
    if category_count == 0:
        db.executemany(
            "INSERT INTO categories (name, color, position) VALUES (?, ?, ?)",
            [(name, color, position) for position, (name, color) in enumerate(DEFAULT_CATEGORIES)],
        )

    bookmark_count = db.execute("SELECT COUNT(*) FROM bookmarks").fetchone()[0]
    if bookmark_count == 0:
        db.executemany(
            """
            INSERT INTO bookmarks (title, url, category_id)
            SELECT ?, ?, id FROM categories WHERE name = ?
            """,
            DEFAULT_BOOKMARKS,
        )

    db.commit()
