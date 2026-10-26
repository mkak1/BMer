# Copilot instructions for Codernator

## Project overview
This repository is a Flask bookmark manager with a SQLite database and a separate browser JavaScript client. Bookmark data belongs on the server; localStorage is only used for one-time legacy import.

## Key files
- `run.py`: local application entry point.
- `app/__init__.py`: Flask app factory and route registration.
- `app/api.py`: JSON API blueprint.
- `app/database.py`: SQLite schema, connection, and seed data.
- `app/templates/index.html`: server-rendered application shell.
- `app/static/js/dashboard.js`: browser interactions and API client.
- `app/static/css/dashboard.css`: primary stylesheet.
- `tests/`: API behavior tests.
- `README.md`: project overview and local run instructions.

## Coding guidelines
- Keep the code simple, readable, and easy to maintain.
- Use the Flask app factory and keep database access in the existing data layer.
- Validate data at the API boundary and use parameterized SQL.
- Keep browser behavior in `app/static/js/dashboard.js` and styles in `app/static/css/dashboard.css`.
- Use semantic HTML and accessible labels/states.
- Do not expose Flask debug mode by default.

## Styling expectations
- Favor clean, minimal CSS.
- Keep selectors simple and intentionally scoped.
- Use accessible contrast and readable typography.
- Maintain responsive behavior when adjusting layout or adding content.

## Validation
- Run `python -m unittest discover -s tests -v` for API changes.
- Run `python -m py_compile app/__init__.py app/api.py app/database.py run.py` for Python changes.
- Start with `python run.py` and verify `http://127.0.0.1:5000` for UI changes.

## Working style
- Make small, focused changes.
- Avoid unnecessary refactors.
- When adding features, preserve server-backed persistence and document setup changes in `README.md`.
