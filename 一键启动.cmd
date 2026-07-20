@echo off
setlocal EnableExtensions
title My Anime Library - User Launcher

cd /d "%~dp0"

echo.
echo ==================================================
echo          My Anime Library - User Launcher
echo ==================================================
echo.

echo [1/7] Checking the runtime environment...
if not exist "package.json" goto :project_missing
if not exist ".env.example" goto :project_missing

where node.exe >nul 2>&1
if errorlevel 1 goto :node_missing

where npm.cmd >nul 2>&1
if errorlevel 1 goto :npm_missing

where powershell.exe >nul 2>&1
if errorlevel 1 goto :powershell_missing

for /f "delims=" %%V in ('node.exe -p "process.versions.node"') do set "NODE_VERSION=%%V"
node.exe -e "const [major, minor] = process.versions.node.split('.').map(Number); process.exit(major > 20 || (major === 20 && minor >= 9) ? 0 : 1)"
if errorlevel 1 goto :node_too_old
echo       Node.js %NODE_VERSION% and npm are ready.

echo [2/7] Preparing the local configuration...
if exist ".env.local" goto :environment_ready
copy /y ".env.example" ".env.local" >nul
if errorlevel 1 goto :environment_failed
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$content = (Get-Content -LiteralPath '.env.local') -replace '^BANGUMI_USER_AGENT=.*$', 'BANGUMI_USER_AGENT='; Set-Content -LiteralPath '.env.local' -Value $content -Encoding UTF8"
if errorlevel 1 goto :environment_failed
echo       Created .env.local. AniList works without credentials.
echo       Bangumi and TMDB credentials can be added later if needed.
goto :environment_done

:environment_ready
echo       Existing .env.local was preserved.

:environment_done
echo [3/7] Checking project dependencies...
if not exist "node_modules\better-sqlite3\package.json" goto :install_dependencies
if not exist "package-lock.json" goto :dependencies_ready
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "if ((Get-Item -LiteralPath 'package-lock.json').LastWriteTimeUtc -gt (Get-Item -LiteralPath 'node_modules\.package-lock.json').LastWriteTimeUtc) { exit 1 }"
if errorlevel 1 goto :install_dependencies
goto :dependencies_ready

:install_dependencies
echo       First run or dependency change detected. Installing packages...
call npm.cmd install
if errorlevel 1 goto :dependency_failed

:dependencies_ready
echo       Project dependencies are ready.

echo [4/7] Initializing or upgrading the local database...
call npm.cmd run db:migrate
if errorlevel 1 goto :migration_failed
echo       The database is ready.

echo [5/7] Building the user version of the app...
if exist ".next\BUILD_ID" goto :build_skip
goto :build_now

:build_skip
echo       Build cache found. Skipping build. Use --rebuild to force.
if /i "%~1"=="--rebuild" goto :build_now
goto :build_done

:build_now
call npm.cmd run build
if errorlevel 1 goto :build_failed

:build_done
echo       The user version is ready.

echo [6/7] Selecting an available port...
set "APP_PORT="
set "ANIME_PORT_FILE=%TEMP%\my-anime-library-port-%RANDOM%-%RANDOM%.tmp"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$selected = $null; foreach ($candidate in 3000..3010) { try { $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $candidate); $listener.Start(); $listener.Stop(); $selected = $candidate; break } catch {} }; if ($null -eq $selected) { exit 1 }; Set-Content -LiteralPath $env:ANIME_PORT_FILE -Value $selected -NoNewline"
if errorlevel 1 goto :port_failed
if not exist "%ANIME_PORT_FILE%" goto :port_failed
set /p APP_PORT=<"%ANIME_PORT_FILE%"
del /q "%ANIME_PORT_FILE%" >nul 2>&1
set "ANIME_PORT_FILE="
if not defined APP_PORT goto :port_failed
echo       Using http://127.0.0.1:%APP_PORT%

if /i "%~1"=="--check" goto :check_complete

echo [7/7] Starting the user version. The browser will open when ready...
echo.
echo       Keep this window open. Press Ctrl+C to stop the app.
echo ==================================================
echo.

start "" powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command "$url = 'http://127.0.0.1:%APP_PORT%'; for ($attempt = 0; $attempt -lt 180; $attempt++) { try { $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 2; if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { Start-Process $url; exit 0 } } catch {}; Start-Sleep -Milliseconds 500 }; exit 1"
call npm.cmd run start -- --hostname 127.0.0.1 --port %APP_PORT%
set "SERVER_EXIT=%ERRORLEVEL%"
if not "%SERVER_EXIT%"=="0" goto :server_failed

echo.
echo The app has stopped.
pause
exit /b 0

:check_complete
echo [7/7] All startup checks passed.
exit /b 0

:project_missing
echo [ERROR] package.json or .env.example is missing.
echo Place this launcher in the project root and try again.
goto :fatal

:node_missing
echo [ERROR] Node.js was not found. Install Node.js 20.9 or newer:
echo https://nodejs.org/
goto :fatal

:npm_missing
echo [ERROR] npm was not found. Reinstall Node.js with npm included.
goto :fatal

:powershell_missing
echo [ERROR] Windows PowerShell was not found.
goto :fatal

:node_too_old
echo [ERROR] Node.js %NODE_VERSION% is too old. Version 20.9 or newer is required.
echo Upgrade Node.js and try again: https://nodejs.org/
goto :fatal

:environment_failed
echo [ERROR] Could not create .env.local. Check that this folder is writable.
goto :fatal

:dependency_failed
echo [ERROR] Dependency installation failed.
echo Check the network, npm configuration, and the error above.
goto :fatal

:migration_failed
echo [ERROR] Database initialization failed. Review the error above.
goto :fatal

:build_failed
echo [ERROR] The user-version build failed. Review the error above.
goto :fatal

:port_failed
if defined ANIME_PORT_FILE del /q "%ANIME_PORT_FILE%" >nul 2>&1
echo [ERROR] No available port was found from 3000 through 3010.
echo Close the program using those ports and try again.
goto :fatal

:server_failed
echo.
echo [ERROR] The app exited unexpectedly with code %SERVER_EXIT%.
echo Review the startup log above.

:fatal
echo.
pause
exit /b 1
