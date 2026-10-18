@echo off
setlocal
rem Run the whole app with Docker (no Node needed) and open http://localhost:8080 (or the next free port up to 8099 when 8080 is busy).
rem Set MOFLO_PORT first (set MOFLO_PORT=9090) to use exactly that port. The port picked for a busy 8080 is kept in .moflo-port.
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
call :choose_port
if errorlevel 1 exit /b 1
set "MOFLO_PORT=%PORT%"
docker compose up --build --detach --wait --wait-timeout 900
if errorlevel 1 (
  echo Docker Compose failed ^(output above^). Is Docker running? If it says port %PORT% is in use, free it or pick another: set MOFLO_PORT=9090 and run this again.
  exit /b 1
)
if defined AUTO_PORT call :remember_port
echo.
docker compose logs --no-log-prefix app | findstr /C:"Open http"
echo.
start "" http://localhost:%PORT%
exit /b 0

rem Picks PORT. A port is busy when something is listening on it; this app's own running container does not count as busy.
:choose_port
set "PORT="
set "OWN="
set "AUTO_PORT="
for /f "delims=" %%a in ('docker compose port app 8080 2^>nul') do if not defined OWN call :last_field "%%a"
if "%OWN%"=="0" set "OWN="
if defined MOFLO_PORT goto user_port
set "AUTO_PORT=1"
if defined OWN (
  set "PORT=%OWN%"
  exit /b 0
)
set "REMEMBERED="
if exist .moflo-port set /p REMEMBERED=<.moflo-port
if defined REMEMBERED call :valid_port "%REMEMBERED%" && call :port_ok "%REMEMBERED%" && set "PORT=%REMEMBERED%"
if defined PORT exit /b 0
for /l %%p in (8080,1,8099) do if not defined PORT call :port_ok %%p && set "PORT=%%p"
if not defined PORT (
  echo Ports 8080-8099 are all in use. Free one, or set MOFLO_PORT to a free port: set MOFLO_PORT=9090
  exit /b 1
)
if not "%PORT%"=="8080" echo Port 8080 is in use; using %PORT% instead.
exit /b 0

:user_port
call :valid_port "%MOFLO_PORT%"
if errorlevel 1 (
  echo MOFLO_PORT must be a port number between 1 and 65535 ^(got "%MOFLO_PORT%"^).
  exit /b 1
)
call :port_ok "%MOFLO_PORT%"
if errorlevel 1 (
  echo Port %MOFLO_PORT% ^(MOFLO_PORT^) is in use. Stop what is using it, or set MOFLO_PORT to a free port: set MOFLO_PORT=9090
  exit /b 1
)
set "PORT=%MOFLO_PORT%"
exit /b 0

rem Sets OWN to the text after the last colon of the argument (127.0.0.1:8080 gives 8080).
:last_field
set "S=%~1"
:last_field_loop
if "%S::=%"=="%S%" goto last_field_done
set "S=%S:*:=%"
goto last_field_loop
:last_field_done
set "OWN=%S%"
exit /b 0

rem Exit code 0 when the argument is a whole number from 1 to 65535.
:valid_port
echo %~1| findstr /R /X "[0-9] [0-9][0-9] [0-9][0-9][0-9] [0-9][0-9][0-9][0-9] [0-9][0-9][0-9][0-9][0-9]" >nul
if errorlevel 1 exit /b 1
if %~1 LSS 1 exit /b 1
if %~1 GTR 65535 exit /b 1
exit /b 0

rem Exit code 0 when the port is free to use: this app already publishes it, or nothing is listening on it.
:port_ok
if "%~1"=="%OWN%" exit /b 0
netstat -ano | findstr /R /C:"127.0.0.1:%~1 .*LISTENING" /C:"0.0.0.0:%~1 .*LISTENING" /C:"\[::\]:%~1 .*LISTENING" >nul
if errorlevel 1 exit /b 0
exit /b 1

rem Keeps a fallback port so the address stays the same next time; 8080 needs no file.
:remember_port
if "%PORT%"=="8080" (
  if exist .moflo-port del .moflo-port
  exit /b 0
)
>.moflo-port echo %PORT%
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
