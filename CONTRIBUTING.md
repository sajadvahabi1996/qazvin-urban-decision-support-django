# Contributing

Contributions are welcome through focused pull requests. Please keep changes
small, explain the problem being solved, and include tests for behavior changes.

## Development setup

1. Create a virtual environment and install `requirements-dev.txt`.
2. Create a local `.env` file using `scripts/init_local_env.py`.
3. Run database migrations with `python manage.py migrate`.

## Quality checks

Run the following before opening a pull request:

```bash
python manage.py check
python manage.py test
ruff check config webgis scripts manage.py
node scripts/build_frontend.mjs
```

The generated `webgis/static/webgis/js/app.bundle.js` must be committed whenever
source modules under `webgis/static/webgis/js/src/` change. Do not edit the
generated bundle directly.

## Data changes

For every new or modified dataset, update `DATA_SOURCES.md` with its publisher,
source URL, acquisition date, coordinate reference system, license, and required
attribution. Do not submit data that cannot legally be redistributed.
