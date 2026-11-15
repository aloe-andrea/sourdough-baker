@echo off
rem Serves the app on your local network so you can open it from your phone (same Wi-Fi).
rem Stop it with Ctrl+C. Nothing leaves your network.
cd /d "%~dp0"
echo.
echo Open this on your phone (same Wi-Fi):
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do echo    http://%%a:8080/
echo.
python -m http.server 8080 --bind 0.0.0.0
