#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -x .venv/bin/python ]]; then
  PYTHON_BIN="${PYTHON_BIN:-python3}"
  "$PYTHON_BIN" -m venv .venv
fi

PY=".venv/bin/python"
"$PY" scripts/init_local_env.py
"$PY" -m pip install -r requirements.txt
"$PY" manage.py check
"$PY" manage.py migrate --noinput
exec "$PY" manage.py runserver 127.0.0.1:8000
