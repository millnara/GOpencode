@echo off
echo Building GOpencode Desktop...
go build -ldflags="-s -w" -o gopencode.exe .
if %ERRORLEVEL% NEQ 0 exit /b %ERRORLEVEL%

echo.
echo sizeof gopencode.exe:
dir gopencode.exe | find "gopencode.exe"

echo.
echo Building NSIS installer...
if not exist dist mkdir dist
"C:\Program Files (x86)\NSIS\Bin\makensis.exe" installer.nsi
if %ERRORLEVEL% NEQ 0 exit /b %ERRORLEVEL%

echo.
echo Done! Installer at:
dir dist\GOpencode-Setup-*.exe | find "GOpencode"
