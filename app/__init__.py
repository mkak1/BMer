import sqlite3
import re
from urllib.parse import urlsplit, urlunsplit

from flask import Flask, jsonify, render_template, request, send_from_directory

from .database import close_db, generate_category_color, get_db, init_db


def create_app(test_config=None):
    app = Flask(__name__, instance_relative_config=True)
    app.config.from_mapping(
        DATABASE=app.instance_path + "/bmer.sqlite",
    )
    if test_config:
        app.config.update(test_config)

    app.teardown_appcontext(close_db)

    @app.after_request
    def add_security_headers(response):
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault(
            "Content-Security-Policy",
            "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; "
            "img-src 'self' data:; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
        )
        return response

    with app.app_context():
        init_db()

    @app.get("/")
    def index():
        return render_template("index.html")

    @app.get("/css/main.css")
    def stylesheet():
        return send_from_directory(app.root_path + "/../css", "main.css")

    @app.get("/api/state")
    def get_state():
        db = get_db()
        categories = db.execute(
            "SELECT id, name, color, position, collapsed FROM categories ORDER BY position, id"
        ).fetchall()
        bookmarks = db.execute(
            """
            SELECT bookmarks.id, bookmarks.title, bookmarks.url, bookmarks.category_id,
                   categories.name AS category, bookmarks.created_at
            FROM bookmarks JOIN categories ON categories.id = bookmarks.category_id
            ORDER BY bookmarks.created_at DESC, bookmarks.id DESC
            """
        ).fetchall()
        return jsonify({
            "categories": [dict(row) for row in categories],
            "bookmarks": [dict(row) for row in bookmarks],
        })

    @app.post("/api/categories")
    def create_category():
        payload = request.get_json(silent=True) or {}
        name = " ".join(str(payload.get("name", "")).split())
        if not name or len(name) > 40:
            return api_error("Category names must be between 1 and 40 characters.", 400)

        db = get_db()
        position = db.execute("SELECT COALESCE(MAX(position), -1) + 1 FROM categories").fetchone()[0]
        existing_colors = [row[0] for row in db.execute("SELECT color FROM categories")]
        color = generate_category_color(existing_colors)
        try:
            cursor = db.execute(
                "INSERT INTO categories (name, color, position) VALUES (?, ?, ?)",
                (name, color, position),
            )
            db.commit()
        except sqlite3.IntegrityError:
            return api_error("A category with that name already exists.", 409)
        category = db.execute("SELECT * FROM categories WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return jsonify(dict(category)), 201

    @app.patch("/api/categories/<int:category_id>")
    def rename_category(category_id):
        payload = request.get_json(silent=True) or {}
        name = " ".join(str(payload.get("name", "")).split())
        if not name or len(name) > 40:
            return api_error("Category names must be between 1 and 40 characters.", 400)

        db = get_db()
        try:
            result = db.execute("UPDATE categories SET name = ? WHERE id = ?", (name, category_id))
            db.commit()
        except sqlite3.IntegrityError:
            return api_error("A category with that name already exists.", 409)
        if result.rowcount == 0:
            return api_error("Category not found.", 404)
        category = db.execute("SELECT * FROM categories WHERE id = ?", (category_id,)).fetchone()
        return jsonify(dict(category))

    @app.delete("/api/categories/<int:category_id>")
    def delete_category(category_id):
        db = get_db()
        category = db.execute(
            "SELECT id, name FROM categories WHERE id = ?",
            (category_id,),
        ).fetchone()
        if category is None:
            return api_error("Category not found.", 404)

        bookmark_count = db.execute(
            "SELECT COUNT(*) FROM bookmarks WHERE category_id = ?",
            (category_id,),
        ).fetchone()[0]
        db.execute("DELETE FROM categories WHERE id = ?", (category_id,))
        db.commit()
        return jsonify({
            "id": category_id,
            "name": category["name"],
            "deletedBookmarkCount": bookmark_count,
        })

    @app.patch("/api/categories/order")
    def update_category_order():
        payload = request.get_json(silent=True) or {}
        ids = payload.get("ids")
        db = get_db()
        existing = [row[0] for row in db.execute("SELECT id FROM categories ORDER BY position, id")]
        if not isinstance(ids, list) or len(ids) != len(existing) or set(ids) != set(existing):
            return api_error("The category order must include each category exactly once.", 400)
        db.executemany("UPDATE categories SET position = ? WHERE id = ?", enumerate(ids))
        db.commit()
        return jsonify({"ids": ids})

    @app.patch("/api/categories/<int:category_id>/collapsed")
    def update_category_collapsed(category_id):
        payload = request.get_json(silent=True) or {}
        collapsed = payload.get("collapsed")
        if not isinstance(collapsed, bool):
            return api_error("collapsed must be a boolean.", 400)
        db = get_db()
        result = db.execute(
            "UPDATE categories SET collapsed = ? WHERE id = ?",
            (int(collapsed), category_id),
        )
        db.commit()
        if result.rowcount == 0:
            return api_error("Category not found.", 404)
        return jsonify({"id": category_id, "collapsed": collapsed})

    @app.patch("/api/categories/<int:category_id>/color")
    def update_category_color(category_id):
        payload = request.get_json(silent=True) or {}
        color = str(payload.get("color", ""))
        if re.fullmatch(r"#[0-9a-fA-F]{6}", color) is None:
            return api_error("Color must be a six-digit hexadecimal value.", 400)

        db = get_db()
        result = db.execute(
            "UPDATE categories SET color = ? WHERE id = ?",
            (color.lower(), category_id),
        )
        db.commit()
        if result.rowcount == 0:
            return api_error("Category not found.", 404)
        return jsonify({"id": category_id, "color": color.lower()})

    @app.post("/api/bookmarks")
    def create_bookmark():
        return save_bookmark()

    @app.put("/api/bookmarks/<int:bookmark_id>")
    def update_bookmark(bookmark_id):
        return save_bookmark(bookmark_id)

    def save_bookmark(bookmark_id=None):
        payload = request.get_json(silent=True) or {}
        title = str(payload.get("title", "")).strip()
        url = normalize_url(payload.get("url", ""))
        category_id = payload.get("categoryId")
        if not title or len(title) > 80:
            return api_error("Bookmark names must be between 1 and 80 characters.", 400)
        if not url:
            return api_error("Enter a valid HTTP or HTTPS URL.", 400)
        if isinstance(category_id, bool) or not isinstance(category_id, int):
            return api_error("Choose a category.", 400)

        db = get_db()
        if db.execute("SELECT id FROM categories WHERE id = ?", (category_id,)).fetchone() is None:
            return api_error("Category not found.", 404)

        if bookmark_id is None:
            cursor = db.execute(
                "INSERT INTO bookmarks (title, url, category_id) VALUES (?, ?, ?)",
                (title, url, category_id),
            )
            bookmark_id = cursor.lastrowid
        else:
            result = db.execute(
                "UPDATE bookmarks SET title = ?, url = ?, category_id = ? WHERE id = ?",
                (title, url, category_id, bookmark_id),
            )
            if result.rowcount == 0:
                return api_error("Bookmark not found.", 404)
        db.commit()
        bookmark = db.execute(
            """
            SELECT bookmarks.id, bookmarks.title, bookmarks.url, bookmarks.category_id,
                   categories.name AS category, bookmarks.created_at
            FROM bookmarks JOIN categories ON categories.id = bookmarks.category_id
            WHERE bookmarks.id = ?
            """,
            (bookmark_id,),
        ).fetchone()
        return jsonify(dict(bookmark)), 201 if request.method == "POST" else 200

    @app.delete("/api/bookmarks/<int:bookmark_id>")
    def delete_bookmark(bookmark_id):
        db = get_db()
        result = db.execute("DELETE FROM bookmarks WHERE id = ?", (bookmark_id,))
        db.commit()
        if result.rowcount == 0:
            return api_error("Bookmark not found.", 404)
        return "", 204

    @app.errorhandler(404)
    def not_found(_error):
        if request.path.startswith("/api/"):
            return api_error("Endpoint not found.", 404)
        return "Not found", 404

    return app


def normalize_url(value):
    raw = str(value).strip()
    if not raw:
        return ""
    if "://" not in raw:
        raw = "https://" + raw
    try:
        parsed = urlsplit(raw)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            return ""
        parsed.port
        return urlunsplit(parsed)
    except ValueError:
        return ""


def api_error(message, status):
    return jsonify({"error": message}), status
