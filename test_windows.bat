@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Qazvin Urban Decision Support - Quality Checks

if not exist ".venv\Scripts\python.exe" (
    echo ERROR: Local Python environment was not found.
    echo Run run_windows.bat once to create the environment and install dependencies.
    pause
    exit /b 1
)

set "PYTHON_EXE=.venv\Scripts\python.exe"

echo [1/4] Installing development dependencies...
"%PYTHON_EXE%" -m pip install -r requirements-dev.txt
if errorlevel 1 goto failed

echo.
echo [2/4] Checking Django configuration...
"%PYTHON_EXE%" manage.py check
if errorlevel 1 goto failed

echo.
echo [3/4] Running Django tests...
"%PYTHON_EXE%" manage.py test --verbosity 2
if errorlevel 1 goto failed

echo.
echo [4/4] Running Ruff checks...
"%PYTHON_EXE%" -m ruff check config webgis scripts manage.py
if errorlevel 1 goto failed

echo.
echo All configured Python checks passed.
where node >nul 2>&1
if not errorlevel 1 (
    echo Running frontend build and syntax checks...
    node scripts\build_frontend.mjs
    if errorlevel 1 goto failed
    node scripts\check_frontend.mjs
    if errorlevel 1 goto failed
) else (
    echo Node.js was not found; frontend checks were skipped.
)

echo.
echo Quality checks completed successfully.
pause
exit /b 0

:failed
echo.
echo One or more checks failed. Review the error output above.
pause
exit /b 1
