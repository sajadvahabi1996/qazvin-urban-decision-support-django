# Architecture overview

## Design goals

The application is a compact WebGIS prototype. Its backend responsibilities
are deliberately limited to rendering the application shell, serving a fixed
catalog of static datasets, exposing a health endpoint, and generating Excel
reports. Spatial visualization and lightweight interactions are performed in
the browser.

## Request flow

```text
Browser
  |
  +--> GET / --------------------------> webgis.views.index
  |                                       |
  |                                       +--> webgis/templates/webgis/index.html
  |                                               |
  |                                               +--> Static CSS / JavaScript
  |
  +--> GET /api/data/<key>/ ----------> webgis.views.dataset
  |                                       |
  |                                       +--> services.datasets
  |                                               |
  |                                               +--> fixed DATASETS catalog
  |                                                       |
  |                                                       +--> webgis/data/*
  |
  +--> GET /api/export/excel/ --------> webgis.views.export_excel
                                          |
                                          +--> services.excel_export
                                                  |
                                                  +--> services.datasets
                                                  +--> openpyxl workbook
```

## Backend boundaries

- `config/` contains Django settings and ASGI/WSGI entry points.
- `webgis/views.py` handles HTTP concerns and delegates file and report work.
- `webgis/services/datasets.py` owns the server-side dataset allowlist and
  resolves only known filenames. Request parameters are never treated as paths.
- `webgis/services/excel_export.py` transforms dataset attributes and geometry
  metadata into workbook sheets. Text that could be interpreted as an Excel
  formula is escaped before writing.
- `webgis/tests/` verifies HTTP contracts, catalog access, report output, and
  frontend script ordering.

## Frontend build

Source modules under `webgis/static/webgis/js/src/` are plain JavaScript files.
`scripts/build_frontend.mjs` validates and joins those files into
`webgis/static/webgis/js/app.bundle.js`. The generated bundle is a normal static
JavaScript file. Browser execution does not depend on `eval()` or
`new Function()`.

The HTML template loads third-party mapping libraries first, then the digital
twin engine, the generated application bundle, layout enhancements, and report
controls. This order is covered by an HTTP-level regression test.

## Data flow and interpretation

The bundled JSON and GeoJSON files are served read-only through named catalog
keys. The frontend uses these datasets for map layers, summaries, and
rule-based scenario exploration. These outputs are exploratory indicators;
they are not an independently validated predictive model or a substitute for
professional planning judgment.

## Operational considerations

- Local development uses SQLite and a generated secret stored in `.env`.
- `.env`, local databases, virtual environments, and generated runtime files
  are excluded by `.gitignore`.
- The repository includes a committed frontend bundle, so Node.js is needed
  only when frontend source modules change.
- External mapping libraries, fonts, and map tiles are loaded from third-party
  services and require network access in the browser.
- Dataset redistribution rights must be verified before public release; see
  `DATA_SOURCES.md`.
