@echo off
REM GOpencode Windows Service Management Script

echo GOpencode Service Management
echo ===========================

if "%1"=="" goto usage

if "%1"=="install" (
    echo Installing GOpencode as Windows service...
    if exist "%~dp0\gopencode.exe" (
        "%~dp0\gopencode.exe" -service
        echo Service installation complete.
    ) else (
        echo Error: gopencode.exe not found in the current directory.
        echo Please run this script from the directory containing gopencode.exe
    )
    goto end
)

if "%1"=="remove" (
    echo Removing GOpencode Windows service...
    sc delete GOpencode
    echo Service removal complete.
    goto end
)

if "%1"=="start" (
    echo Starting GOpencode service...
    net start GOpencode
    goto end
)

if "%1"=="stop" (
    echo Stopping GOpencode service...
    net stop GOpencode
    goto end
)

if "%1"=="status" (
    echo GOpencode service status:
    sc query GOpencode
    goto end
)

if "%1"=="run" (
    echo Running GOpencode in background mode...
    start "" /B "%~dp0\gopencode.exe"
    echo GOpencode is now running in background mode.
    goto end
)

:usage
echo Usage: %~n0 [command]
echo.
echo Commands:
echo   install    - Install GOpencode as a Windows service
echo   remove     - Remove the GOpencode service
echo   start      - Start the GOpencode service
echo   stop       - Stop the GOpencode service  
echo   status     - Check service status
echo   run        - Run GOpencode in background mode (not as service)
echo.
echo Examples:
echo   %~n0 install
echo   %~n0 start
echo   %~n0 stop

:end