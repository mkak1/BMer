import colorsys
import secrets
import sqlite3
from pathlib import Path

from flask import current_app, g


DEFAULT_CATEGORIES = ["Design", "Development", "Productivity", "Learning"]

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


def generate_category_color(existing_colors=()):
    used_colors = set(existing_colors)
    existing_hues = [category_color_hue(color) for color in used_colors]
    minimum_hue_gap = min(22 / 360, 0.9 / (len(existing_hues) + 1))
    for _ in range(720):
        hue = secrets.randbelow(360) / 360
        if any(
            min(abs(hue - existing), 1 - abs(hue - existing)) < minimum_hue_gap
            for existing in existing_hues
        ):
            continue
        lightness = (secrets.randbelow(10) + 64) / 100
        saturation = (secrets.randbelow(20) + 58) / 100
        red, green, blue = colorsys.hls_to_rgb(hue, lightness, saturation)
        color = "#{:02x}{:02x}{:02x}".format(
            round(red * 255), round(green * 255), round(blue * 255)
        )
        if color not in used_colors:
            return color
    raise RuntimeError("Unable to generate a distinct category color.")


def category_color_hue(color):
    red, green, blue = (int(color[index:index + 2], 16) / 255 for index in (1, 3, 5))
    return colorsys.rgb_to_hls(red, green, blue)[0]


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
    color_schema_version = db.execute("PRAGMA user_version").fetchone()[0]
    if category_count == 0:
        used_colors = set()
        for position, name in enumerate(DEFAULT_CATEGORIES):
            color = generate_category_color(used_colors)
            db.execute(
                "INSERT INTO categories (name, color, position) VALUES (?, ?, ?)",
                (name, color, position),
            )
            used_colors.add(color)
    elif color_schema_version < 2:
        used_colors = set()
        categories = db.execute("SELECT id FROM categories ORDER BY position, id").fetchall()
        for category in categories:
            color = generate_category_color(used_colors)
            db.execute("UPDATE categories SET color = ? WHERE id = ?", (color, category["id"]))
            used_colors.add(color)
            db.execute("PRAGMA user_version = 2")

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
