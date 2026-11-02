@echo off
setlocal EnableExtensions
cd /d "%~dp0"
echo This will remove only the Python virtual environment folder: .venv
echo It will NOT remove .env, db.sqlite3, project data, or source code.
choice /M "Continue and rebuild the Python environment"
if errorlevel 2 exit /b 0
if exist ".venv" rmdir /s /q ".venv"
call run_windows.bat
endlocal
