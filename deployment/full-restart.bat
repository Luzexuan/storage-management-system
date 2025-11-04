@echo off
REM Full restart script for Windows (for local testing)

echo ==========================================
echo Starting FULL system restart (Windows)...
echo ==========================================

cd /d "%~dp0\.."

echo.
echo Step 1: Stopping all PM2 processes...
call pm2 delete all 2>nul
call pm2 kill

echo.
echo Step 2: Killing all Node.js processes...
taskkill /F /IM node.exe 2>nul
taskkill /F /IM PM2.exe 2>nul

echo.
echo Step 3: Waiting for processes to terminate...
timeout /t 3 /nobreak >nul

echo.
echo Step 4: Clearing PM2 cache...
if exist "%USERPROFILE%\.pm2\logs" rd /s /q "%USERPROFILE%\.pm2\logs"
if exist "%USERPROFILE%\.pm2\pids" rd /s /q "%USERPROFILE%\.pm2\pids"
if exist "%USERPROFILE%\.pm2\dump.pm2" del /f /q "%USERPROFILE%\.pm2\dump.pm2"

echo.
echo Step 5: Clearing Node.js module cache...
if exist "backend\node_modules\.cache" rd /s /q "backend\node_modules\.cache"

echo.
echo Step 6: Restarting PM2...
call pm2 start deployment\ecosystem.config.js

echo.
echo Step 7: Waiting for application to start...
timeout /t 5 /nobreak >nul

echo.
echo Step 8: Checking PM2 status...
call pm2 status

echo.
echo ==========================================
echo Full restart completed!
echo ==========================================
echo.
echo Next steps:
echo 1. Clear browser cache (Ctrl+Shift+Delete)
echo 2. Hard refresh the page (Ctrl+Shift+R)
echo 3. Test the new features
echo ==========================================

pause
