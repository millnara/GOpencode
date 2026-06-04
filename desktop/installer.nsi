; GOpencode Desktop Installer
Unicode true
!include "MUI2.nsh"

Name "GOpencode"
OutFile "dist\GOpencode-Setup-0.3.0.exe"
InstallDir "$PROGRAMFILES64\GOpencode"
RequestExecutionLevel admin

!define MUI_ICON "assets\icon.ico"
!define MUI_UNICON "assets\icon.ico"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

Section "Install"
  SetOutPath "$INSTDIR"
  File "gopencode.exe"
  File "assets\icon.ico"
  CreateDirectory "$INSTDIR\assets"
  File /r "assets\*"

  CreateDirectory "$SMPROGRAMS\GOpencode"
  CreateShortCut "$SMPROGRAMS\GOpencode\GOpencode.lnk" "$INSTDIR\gopencode.exe" "" "$INSTDIR\icon.ico"
  CreateShortCut "$DESKTOP\GOpencode.lnk" "$INSTDIR\gopencode.exe" "" "$INSTDIR\icon.ico"

  WriteUninstaller "$INSTDIR\uninstall.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\GOpencode" "DisplayName" "GOpencode"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\GOpencode" "UninstallString" "$INSTDIR\uninstall.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\GOpencode" "DisplayIcon" "$INSTDIR\icon.ico"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\GOpencode" "Publisher" "GOpencode"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\GOpencode" "DisplayVersion" "0.3.0"
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\GOpencode" "NoModify" 1
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\GOpencode" "NoRepair" 1

  ExecShell "" "$INSTDIR\gopencode.exe"
SectionEnd

Section "Uninstall"
  Delete "$INSTDIR\gopencode.exe"
  Delete "$INSTDIR\icon.ico"
  RMDir /r "$INSTDIR\assets"
  Delete "$INSTDIR\uninstall.exe"
  RMDir "$INSTDIR"

  Delete "$SMPROGRAMS\GOpencode\GOpencode.lnk"
  RMDir "$SMPROGRAMS\GOpencode"
  Delete "$DESKTOP\GOpencode.lnk"

  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\GOpencode"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "GOpencode"
SectionEnd
