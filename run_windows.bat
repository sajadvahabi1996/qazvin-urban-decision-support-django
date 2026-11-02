@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title Qazvin Urban Decision Support WebGIS

echo ============================================================
echo   Qazvin Urban Decision Support - Local Development Server
echo ============================================================
echo.

if not exist ".venv\Scripts\python.exe" (
    echo [1/5] Creating Python virtual environment...
    set "PY_CREATE="
    py -3.12 --version >nul 2>&1 && set "PY_CREATE=py -3.12"
    if not defined PY_CREATE py -3.13 --version >nul 2>&1 && set "PY_CREATE=py -3.13"
    if not defined PY_CREATE py -3.14 --version >nul 2>&1 && set "PY_CREATE=py -3.14"
    if not defined PY_CREATE (
        python -c "import sys; raise SystemExit(0 if sys.version_info >= (3,12) else 1)" >nul 2>&1 && set "PY_CREATE=python"
    )
    if not defined PY_CREATE goto no_python
    !PY_CREATE! -m venv .venv
    if errorlevel 1 goto setup_failed
) else (
    echo [1/5] Reusing existing .venv environment...
)

set "PYTHON_EXE=.venv\Scripts\python.exe"
if not exist "%PYTHON_EXE%" goto setup_failed

echo.
echo [2/5] Preparing local environment settings...
"%PYTHON_EXE%" scripts\init_local_env.py
if errorlevel 1 goto setup_failed

echo.
echo [3/5] Installing Python dependencies...
"%PYTHON_EXE%" -m pip install -r requirements.txt
if errorlevel 1 goto dependency_failed

echo.
echo [4/5] Checking Django configuration...
"%PYTHON_EXE%" manage.py check
if errorlevel 1 goto setup_failed

echo.
echo [5/5] Applying database migrations...
"%PYTHON_EXE%" manage.py migrate --noinput
if errorlevel 1 goto setup_failed

echo.
echo ============================================================
echo   Server is starting.
echo   Open: http://127.0.0.1:8000/
echo   Stop the server with CTRL+C.
echo ============================================================
echo.
"%PYTHON_EXE%" manage.py runserver 127.0.0.1:8000
goto end

:no_python
echo ERROR: Python was not found.
echo Install Python 3.12 or newer and enable the Python Launcher, then try again.
goto failed

:dependency_failed
echo.
echo ERROR: Dependency installation failed.
echo Check your internet connection or Python package index access, then run this file again.
echo Your project files have not been deleted.
goto failed

:setup_failed
echo.
echo ERROR: Setup failed. Read the error shown above.
echo If .venv was created with a different Python installation, delete the .venv folder and run again.
goto failed

:failed
pause
exit /b 1

:end
endlocal
