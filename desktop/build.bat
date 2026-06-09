@echo off
REM GOpencode Desktop Build Script - Windows GUI App (No Console)

echo Building GOpencode Desktop App (Windows GUI - No Console)...
echo ================================

REM Clean previous builds
if exist dist\gopencode.exe del dist\gopencode.exe
if exist dist mkdir dist
del /Q "dist\*.exe"

echo Building Windows GUI application (no console window)...
go build -ldflags="-s -w -H windowsgui" -o dist/gopencode.exe .
if %ERRORLEVEL% NEQ 0 exit /b %ERRORLEVEL%

echo.
echo Build successful! Windows GUI app created:
echo   dist/gopencode.exe                          - Windows GUI app (no console)

echo.
echo sizeof dist\gopencode.exe:
dir dist\gopencode.exe | find "gopencode.exe"

echo.
echo Building NSIS installer...
"C:\Program Files (x86)\NSIS\Bin\makensis.exe" installer.nsi
if %ERRORLEVEL% NEQ 0 exit /b %ERRORLEVEL%

echo.
echo Done! Files created:
echo   - dist/gopencode.exe (main executable)
echo   - dist/GOpencode-Setup-*.exe (installer)
