@echo off
echo ================================
echo Killing all Python processes...
echo ================================
taskkill /F /IM python.exe 2>nul
timeout /t 3 /nobreak >nul

echo.
echo ================================
echo Starting Backend Server...
echo ================================
cd /d "%~dp0"
python -m uvicorn server:app --reload --port 8000
