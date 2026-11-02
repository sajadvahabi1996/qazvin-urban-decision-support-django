# Qazvin Urban Decision Support WebGIS

A Django-powered WebGIS prototype for exploring selected urban datasets in
Qazvin, Iran. The application brings urban information layers, map-based
exploration, neighborhood context, lightweight spatial tools, and Excel
reporting together in one browser-based workspace.

[Read this guide in Persian](README.fa.md)


## Key capabilities

- Interactive Leaflet map with switchable urban information layers.
- Exploration of road networks, public transport stops, fuel stations,
  healthcare facilities, land use, neighborhood boundaries, and reported urban
  issues.
- Neighborhood search and map navigation.
- Browser-based buffer, density, and nearest-stop tools.
- Digital-twin-inspired scenario exploration using predefined rules and the
  available urban attributes.
- Summary charts generated from the bundled datasets.
- Excel export for an individual data layer or the complete dataset catalog.
- A small Django API for serving approved datasets and generating reports.

> **Interpretation and modeling note:** This repository is a decision-support
> prototype, not a validated urban forecasting system. The nearest-stop tool
> uses straight-line distance rather than road-network travel distance.
> Buffer overlays represent geometric proximity, not actual pedestrian
> accessibility or population coverage. Heatmaps summarize the distribution
> of available records; they do not establish causality. Scenario scores are
> rule-based indicators and must not be interpreted as measured risk,
> predictions, or official municipal priorities.

## Technology stack

| Layer | Technology |
|---|---|
| Backend | Python, Django |
| Frontend | HTML, CSS, JavaScript |
| Mapping | Leaflet, OpenStreetMap tiles |
| Spatial data | GeoJSON and JSON |
| Browser-side geospatial utilities | Turf.js, Leaflet.heat, Leaflet.markercluster |
| Reports | openpyxl |
| Local database | SQLite |
| Quality checks | Django test framework, Ruff, GitHub Actions |

## Architecture

The Django application is intentionally kept small. HTTP request handling is
implemented in `webgis/views.py`; access to bundled files is restricted to a
fixed catalog in `webgis/services/datasets.py`; spreadsheet generation is
isolated in `webgis/services/excel_export.py`. Frontend source modules are kept
under `webgis/static/webgis/js/src/` and combined into a static bundle at build
time. The browser does not need to evaluate dynamically generated JavaScript.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the request flow and
project boundaries.

## Repository layout

```text
config/                         Django project configuration
webgis/
  data/                         Bundled JSON and GeoJSON datasets
  services/
    datasets.py                 Dataset catalog and safe file access
    excel_export.py             XLSX report generation
  templates/webgis/             Django templates
  static/webgis/
    css/                        Application stylesheets
    js/src/                     Frontend source modules
    js/app.bundle.js            Generated frontend bundle
    js/                          Supporting browser scripts
  tests/                        Backend and endpoint tests
scripts/
  build_frontend.mjs            Deterministic frontend build
  init_local_env.py             Local environment bootstrap
run_windows.bat                 Windows development launcher
reset_env_windows.bat           Recreate the local virtual environment
requirements*.txt               Runtime and development dependencies
```

## Requirements

- Python 3.12 or newer, using a version supported by the selected Django
  release.
- Node.js 22 only when rebuilding the frontend bundle.
- Internet access for installing Python packages and loading third-party map
  libraries and map tiles referenced by the frontend.

The generated frontend bundle is committed to the repository, so Node.js is not
required to run the application locally. The root `package.json` contains only
build/check scripts and does not add third-party Node dependencies.

## Quick start on Windows

1. Extract or clone the repository.
2. Open the project directory.
3. Double-click `run_windows.bat`.
4. Open <http://127.0.0.1:8000/> in a browser.

The launcher creates a virtual environment if needed, prepares a local `.env`
file with a generated development secret, installs runtime dependencies,
checks the Django configuration, applies database migrations, and starts the
local development server.

### Manual Windows setup

Run these commands from the repository root in PowerShell:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe scripts\init_local_env.py
.\.venv\Scripts\python.exe manage.py check
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py runserver
```

If the local virtual environment is broken or was created with another Python
installation, run `reset_env_windows.bat`. It recreates `.venv` and preserves
`.env` and `db.sqlite3`.

### Linux and macOS

```bash
python3 -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python scripts/init_local_env.py
python manage.py check
python manage.py migrate
python manage.py runserver
```

## Frontend development

Edit source files under `webgis/static/webgis/js/src/`. From the repository
root, rebuild the browser bundle with:

```bash
node scripts/build_frontend.mjs
```

The script validates each source module, creates a deterministic static bundle,
and checks its syntax before writing `webgis/static/webgis/js/app.bundle.js`.
Do not edit the generated bundle directly. The build avoids runtime `eval` and
`new Function` calls.

## HTTP endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/` | Main WebGIS interface |
| GET | `/health/` | Basic service health check |
| GET | `/api/data/<dataset>/` | Serve a catalogued JSON or GeoJSON layer |
| GET | `/api/export/excel/?dataset=all` | Export the complete data catalog to XLSX |
| GET | `/api/export/excel/?dataset=problems` | Export one data layer to XLSX |

Dataset keys are validated against a fixed server-side catalog. User input is
never interpreted as an arbitrary filesystem path.

## Tests and code quality

Install development dependencies and run the checks from the repository root:

```bash
python -m pip install -r requirements-dev.txt
python manage.py check
python manage.py test --verbosity 2
ruff check config webgis scripts manage.py
npm run build
npm run check
```

The Django tests cover page rendering and frontend asset order, the health
endpoint, catalog restrictions, JSON/GeoJSON responses, HTTP method handling,
Excel workbook generation, and formula-injection mitigation. GitHub Actions
runs backend checks and frontend build/syntax checks on pushes and pull
requests. On Windows, `test_windows.bat` runs the Python checks and, when Node.js
is available, rebuilds and validates the frontend bundle.

## Configuration

Local configuration is read from environment variables and `.env`:

| Variable | Purpose |
|---|---|
| `DJANGO_SECRET_KEY` | Required Django secret key |
| `DJANGO_DEBUG` | Enable or disable debug mode |
| `DJANGO_ALLOWED_HOSTS` | Comma-separated allowed hostnames |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | Optional trusted origins |
| `DJANGO_SECURE_SSL_REDIRECT` | Force HTTPS redirects |
| `DJANGO_SECURE_HSTS_SECONDS` | HSTS duration when debug mode is off |

Use `.env.example` as a reference. Never commit a real `.env` file. Before any
production deployment, set `DJANGO_DEBUG=0`, generate a unique secret key,
restrict allowed hosts, configure HTTPS, and review Django's deployment
checklist for the target hosting environment.

## Data provenance and redistribution

See [DATA_SOURCES.md](DATA_SOURCES.md) for the dataset inventory. The source
project did not provide complete provenance and redistribution-license records
for every layer. Those details are explicitly marked as requiring maintainer
verification. Before publishing or redistributing this repository, confirm
that each dataset and screenshot may be shared publicly and add required source
attribution. OpenStreetMap attribution for the basemap does not establish the
license of the other bundled data.

## Project status

This is a research and portfolio prototype. Its outputs should be reviewed by
qualified analysts before being used to support operational or public-sector
decisions. Production deployment, formal security review, and independent data
validation are outside the scope of this repository version.
