@echo off
rem Run the whole app with Docker (no Node needed) and open http://localhost:8080.
rem   start.cmd           build, start, wait until healthy, print the demo login, open the browser
rem   start.cmd --stop    stop it (the data stays)
rem   start.cmd --reset   stop it and delete its data volume
cd /d "%~dp0"
if not "%~1"=="" if not "%~1"=="--stop" if not "%~1"=="--reset" (
  echo Usage: start.cmd [--stop ^| --reset]
  exit /b 2
)
where docker >nul 2>&1
if errorlevel 1 (
  echo Docker is not installed. Install Docker Desktop: https://docs.docker.com/get-started/get-docker/
  exit /b 1
)
docker info >nul 2>&1
if errorlevel 1 call :start_docker
if errorlevel 1 exit /b 1
if "%~1"=="--stop" (
  docker compose down && echo Stopped. Run start.cmd to start again; your data is kept.
  exit /b %errorlevel%
)
if "%~1"=="--reset" (
  docker compose down --volumes && echo Stopped and deleted the local data.
  exit /b %errorlevel%
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
exit /b 0

rem Starts Docker Desktop if it is installed, then waits up to 3 minutes for the engine.
:start_docker
echo Docker is not running - starting Docker Desktop...
if not exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" (
  echo Docker Desktop was not found. Start Docker and run this again.
  exit /b 1
)
start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
for /l %%i in (1,1,60) do (
  docker info >nul 2>&1
  if not errorlevel 1 (
    echo.
    exit /b 0
  )
  <nul set /p "=."
  timeout /t 3 /nobreak >nul
)
echo.
echo Docker did not start within 3 minutes. Open Docker Desktop, wait until it says Engine running, then run this again.
exit /b 1
