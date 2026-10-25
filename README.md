# BMer

BMer is a server-backed bookmark manager. The Flask application serves the dashboard and JSON API; SQLite stores bookmarks, categories, category order, and collapsed state.

## Requirements

- Python 3.10 or newer

## Run locally

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python run.py
```

Open http://127.0.0.1:5000. The SQLite database is created at `instance/bmer.sqlite` on first launch. Run `python -m unittest discover -s tests -v` to execute the API tests.

The app is configured for a single local user and binds to loopback by default. Before exposing it to a network, add authentication, configure a production WSGI server, and use an appropriate deployment setup.

## Project structure

- `app/__init__.py` creates the Flask app and defines the JSON API.
- `app/database.py` owns the SQLite connection, schema, and initial data.
- `app/templates/` contains the server-rendered HTML shell.
- `app/static/js/` contains the browser client.
- `css/` contains the dashboard stylesheet.
- `tests/` contains API behavior tests.
