; GOpencode Desktop Installer
; Network-setup page detects external IPs via curl and local IP via ipconfig,
; asks for the gateway port, and writes %APPDATA%\GOpencode\config.json.

Unicode true
!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"

Name "GOpencode"
OutFile "dist\GOpencode-Setup-1.0.0.exe"
InstallDir "$PROGRAMFILES64\GOpencode"
RequestExecutionLevel admin

!define MUI_ICON "assets\icon.ico"
!define MUI_UNICON "assets\icon.ico"
!define MUI_ABORTWARNING

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
Page custom NetworkPageCreate NetworkPageLeave
!insertmacro MUI_PAGE_INSTFILES


!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Var NetworkDialog
Var lblStatus
Var lblIP4
Var lblIP6
Var lblLocal
Var lblPort
Var inpPort
Var lblHelp
Var extIP
Var extIP6
Var localIP

Function DetectIPs
  StrCpy $extIP ""
  StrCpy $extIP6 ""
  StrCpy $localIP ""

  ; External IPv4 via curl
  nsExec::ExecToStack '"$SYSDIR\curl.exe" -s -m 5 https://api.ipify.org'
  Pop $3
  Pop $4
  StrCmp $3 "0" 0 noIPv4
    StrCpy $extIP $4
  noIPv4:

  ; External IPv6
  nsExec::ExecToStack '"$SYSDIR\curl.exe" -s -m 5 -6 https://api6.ipify.org'
  Pop $3
  Pop $4
  StrCmp $3 "0" 0 noIPv6
    StrCpy $extIP6 $4
  noIPv6:

  ; Local IP — use a batch file to extract the first non-link-local IPv4 address
  ; This works for any number of network adapters and handles edge cases
  FileOpen $0 "C:\Users\Gary\AppData\Local\Temp\gopencode_getip.bat" w
  FileWrite $0 '@echo off$\r$\n'
  FileWrite $0 'ipconfig | findstr /R /C:"IPv4" > C:\Users\Gary\AppData\Local\Temp\gopencode_ip4_raw.txt$\r$\n'
  FileClose $0

  nsExec::ExecToLog 'C:\Users\Gary\AppData\Local\Temp\gopencode_getip.bat'

  ; Now parse the file line by line using NSIS FileRead
  FileOpen $1 "C:\Users\Gary\AppData\Local\Temp\gopencode_ip4_raw.txt" r
  ip4Loop:
    FileRead $1 $2
    IfErrors noIPconfig
    StrCmp $2 "" ip4Loop

    ; Strip leading spaces before checking for Autoconfiguration
    StrCpy $3 $2
    stripLead:
      StrCpy $4 $3 1 0
      StrCmp $4 " " 0 afterStrip
        StrCpy $3 $3 "" 1
        Goto stripLead
    afterStrip:

    ; Check if this is a Tailscale/Docker link-local line
    StrCpy $4 $3 17
    StrCmp $4 "Autoconfiguration" ip4Loop 0

    ; Line format: "   IPv4 Address. . . . . . . . . . . : 192.168.1.105"
    ; Find the last colon
    StrLen $4 $2
    findColon:
      IntOp $4 $4 - 1
      ${If} $4 < 0
        Goto ip4Loop
      ${EndIf}
      StrCpy $5 $2 1 $4
      StrCmp $5 ":" 0 findColon
        ; Found colon at position $4, IP starts at $4+1
        IntOp $4 $4 + 1
        StrCpy $localIP $2 "" $4
        ; Strip leading spaces
        stripLeading:
          StrCpy $5 $localIP 1 0
          StrCmp $5 " " 0 gotIP
            StrCpy $localIP $localIP "" 1
            Goto stripLeading
        gotIP:
        ; Strip trailing whitespace
        StrLen $6 $localIP
        stripTrailing:
          ${If} $6 > 0
            IntOp $6 $6 - 1
            StrCpy $7 $localIP 1 $6
            ${If} $7 == "$\r"
            ${OrIf} $7 == "$\n"
            ${OrIf} $7 == " "
              StrCpy $localIP $localIP $6
              Goto stripTrailing
            ${EndIf}
          ${EndIf}
        Goto noIPconfig
    Goto ip4Loop

  noIPconfig:
  FileClose $1
  Delete "C:\Users\Gary\AppData\Local\Temp\gopencode_ip4_raw.txt"
  Delete "C:\Users\Gary\AppData\Local\Temp\gopencode_getip.bat"
FunctionEnd

Function NetworkPageCreate
  !insertmacro MUI_HEADER_TEXT "Network setup" "Configure how your phone connects"

  nsDialogs::Create 1018
  Pop $NetworkDialog
  StrCmp $NetworkDialog error 0 pageOK
    Abort
  pageOK:
  ${NSD_CreateLabel} 0u 0u 100% 20u \
    "GOpencode runs a gateway on this PC."
  Pop $0

  ${NSD_CreateLabel} 0u 24u 100% 12u ""
  Pop $lblStatus

  ${NSD_CreateLabel} 0u 40u 100% 10u "Public IPv4:"
  Pop $lblIP4

  ${NSD_CreateLabel} 0u 52u 100% 10u "Public IPv6:"
  Pop $lblIP6

  ${NSD_CreateLabel} 0u 64u 100% 10u "Local IP:"
  Pop $lblLocal

  ${NSD_CreateLabel} 0u 84u 100% 10u "Gateway port (1024-65535, default 8765):"
  Pop $lblPort

  ${NSD_CreateNumber} 0u 96u 100% 12u "8765"
  Pop $inpPort

  ${NSD_CreateLabel} 0u 114u 100% 40u ""
  Pop $lblHelp

  ; Run detection BEFORE showing the dialog
  Call DetectIPs
  Call DetectIPs
  FileOpen $8 "C:\Windows\Temp\gopencode_debug.log" a
  FileWrite $8 'DetectIPs returned$\r$\n'
  FileClose $8

  StrCmp $extIP "" noExtIP
    ${NSD_SetText} $lblIP4 "Public IPv4: $extIP"
    Goto showExtIP6
  noExtIP:
    ${NSD_SetText} $lblIP4 "Public IPv4: not detected"
  showExtIP6:

  StrCmp $extIP6 "" noExtIP6
    ${NSD_SetText} $lblIP6 "Public IPv6: $extIP6"
    Goto showLocal
  noExtIP6:
    ${NSD_SetText} $lblIP6 "Public IPv6: not detected"
  showLocal:

  StrCmp $localIP "" noLocal
    ${NSD_SetText} $lblLocal "Local IP: $localIP"
    Goto showStatus
  noLocal:
    ${NSD_SetText} $lblLocal "Local IP: not detected"
  showStatus:

  StrCmp $extIP "" noExtIPStatus
    ${NSD_SetText} $lblStatus "Done. Your phone can connect to ws://$extIP:<port> from anywhere."
    Goto showHelp
  noExtIPStatus:
    ${NSD_SetText} $lblStatus "Done. Same-WiFi only. For outside access, set a public IP below."
  showHelp:

  StrCmp $extIP "" noExtIPHelp
    ${NSD_SetText} $lblHelp \
      "GOpencode can try UPnP port forwarding automatically, or you can forward the port on your router manually."
    Goto showDialog
  noExtIPHelp:
    ${NSD_SetText} $lblHelp \
      "No public IP found. You can still use GOpencode on the same WiFi.$\r$\nFor remote access, set the IP above or forward a port on your router."
  showDialog:

  nsDialogs::Show
FunctionEnd

Function NetworkPageLeave
  ${NSD_GetText} $inpPort $0
  StrCmp $0 "" 0 notEmpty
    MessageBox MB_ICONEXCLAMATION "Please enter a port number."
    Abort
  notEmpty:
  ${If} $0 < 1024
  ${OrIf} $0 > 65535
    MessageBox MB_ICONEXCLAMATION "Port must be between 1024 and 65535."
    Abort
  ${EndIf}
FunctionEnd

Section "Install"
  SetOutPath "$INSTDIR"
  File "dist\gopencode.exe"
  File "assets\icon.ico"
  File "assets\icon_idle.ico"
  File "assets\icon_green.ico"
  File "assets\icon_red.ico"
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
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\GOpencode" "DisplayVersion" "1.0.0"
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\GOpencode" "NoModify" 1
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\GOpencode" "NoRepair" 1
SectionEnd


Function .onInit
  ; Stop any running GOpencode instance so we can replace the executable.
  nsExec::ExecToStack 'taskkill /F /IM gopencode.exe'
  Pop $0
FunctionEnd

Function .onInstSuccess
  nsExec::ExecToStack 'taskkill /F /IM gopencode.exe'
  Pop $0

  ${NSD_GetText} $inpPort $0

  SetShellVarContext all
  CreateDirectory "$APPDATA\GOpencode"

  IfFileExists "$APPDATA\GOpencode\config.json" skipConfig
  FileOpen $2 "$APPDATA\GOpencode\config.json" w
  FileWrite $2 '{'
  FileWrite $2 '$\r$\n  "port": $0,'
  FileWrite $2 '$\r$\n  "ocUrl": "http://127.0.0.1:4096",'
  FileWrite $2 '$\r$\n  "username": "opencode",'
  FileWrite $2 '$\r$\n  "password": "",'
  FileWrite $2 '$\r$\n  "autoStart": false,'
  FileWrite $2 '$\r$\n  "host": "",'
  FileWrite $2 '$\r$\n  "headless": false'
  FileWrite $2 '$\r$\n}'
  FileClose $2
  skipConfig:

  DetailPrint "Configuring Windows Firewall to allow incoming connections on port $0..."
  nsExec::ExecToLog '"$SYSDIR\netsh.exe" advfirewall firewall add rule name="GOpencode Gateway" dir=in action=allow protocol=TCP localport=$0'

  ; Launch the app
  Exec '"$INSTDIR\gopencode.exe"'
FunctionEnd

Section "Uninstall"
  Delete "$INSTDIR\gopencode.exe"
  Delete "$INSTDIR\icon.ico"
  Delete "$INSTDIR\icon_idle.ico"
  Delete "$INSTDIR\icon_green.ico"
  Delete "$INSTDIR\icon_red.ico"
  RMDir /r "$INSTDIR\assets"
  Delete "$INSTDIR\uninstall.exe"
  RMDir "$INSTDIR"

  Delete "$SMPROGRAMS\GOpencode\GOpencode.lnk"
  RMDir "$SMPROGRAMS\GOpencode"
  Delete "$DESKTOP\GOpencode.lnk"

  DetailPrint "Removing Windows Firewall rule..."
  nsExec::ExecToLog '"$SYSDIR\netsh.exe" advfirewall firewall delete rule name="GOpencode Gateway"'

  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\GOpencode"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "GOpencode"
SectionEnd
