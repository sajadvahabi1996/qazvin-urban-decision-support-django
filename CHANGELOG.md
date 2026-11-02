# Changelog

## 0.1.0 — 2026-11-02

- Packaged the Django WebGIS as a maintainable repository with English and
  Persian documentation.
- Separated dataset access and Excel generation into backend service modules.
- Added structured tests for dataset handling, HTTP endpoints, and Excel output.
- Corrected JSON and GeoJSON response media types.
- Rebuilt the frontend as a static bundle, avoiding runtime `eval()` and
  `new Function()` calls.
- Added frontend syntax checks and automated GitHub Actions workflows.
- Added repository contribution guidance and data provenance documentation.
