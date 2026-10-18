@echo off
rem Run the whole app with Docker (no Node needed) and open http://localhost:8080.
rem   start.cmd           build, start, wait until healthy, print the demo login, open the browser
rem   start.cmd --stop    stop it (the data stays)
rem   start.cmd --reset   stop it and delete its data volume
cd /d "%~dp0"
if "%~1"=="--stop" (
  docker compose down && echo Stopped. Run start.cmd to start again; your data is kept.
  exit /b %errorlevel%
)
if "%~1"=="--reset" (
  docker compose down --volumes && echo Stopped and deleted the local data.
  exit /b %errorlevel%
)
if not "%~1"=="" (
  echo Usage: start.cmd [--stop ^| --reset]
  exit /b 2
)
docker compose up --build --detach --wait --wait-timeout 900
if errorlevel 1 (
  echo Docker Compose failed ^(output above^). Is Docker running? Is port 8080 free?
  exit /b 1
)
echo.
docker compose logs --no-log-prefix app | findstr /C:"Open http"
echo.
start "" http://localhost:8080
