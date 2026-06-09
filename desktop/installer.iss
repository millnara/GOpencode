; GOpencode Desktop Installer - Inno Setup 7
; Proper setup wizard with network configuration pages

#define MyAppName "GOpencode"
#define MyAppVersion "0.3.0"
#define MyAppPublisher "GOpencode"
#define MyAppExeName "gopencode.exe"
#define MyAppURL ""

[Setup]
AppId={{B8A7E4D2-1F3C-4D6E-A5B7-C9D8E0F1A2B3}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultGroupName={#MyAppName}
DefaultDirName={autopf}\{#MyAppName}
DisableProgramGroupPage=yes
OutputBaseFilename=GOpencode-Setup-{#MyAppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
SetupIconFile=assets\icon.ico
UninstallDisplayIcon={app}\icon.ico
UninstallDisplayName={#MyAppName}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Messages]
english.WelcomeLabel1=Welcome to GOpencode Setup
english.WelcomeLabel2=This will install GOpencode on your computer.%n%nGOpencode lets you control opencode from your phone by running a small gateway on this PC. Your phone talks to the gateway over your local network (WiFi) or, if you want to reach this PC from outside your home, over the internet.%n%nClick Next to continue.

[Files]
Source: "dist\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion
Source: "assets\*"; DestDir: "{app}\assets"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\icon.ico"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\icon.ico"

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch GOpencode"; Flags: nowait postinstall shellexec

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

[Code]
const
  AppDataRelPath = 'GOpencode\config.json';
  DetectFile = 'gopencode_detect.txt';
var
  NetworkPage: TInputQueryWizardPage;
  PortPage: TInputQueryWizardPage;
  SummaryPage: TOutputMsgWizardPage;
  GatewayPort: String;
  ExternalIP: String;
  ExternalIP6: String;
  LocalIP: String;
  HasExternalIP: Boolean;

function ParseValue(const Line, Prefix: String; OffsetAfter: Integer): String;
var
  L: Integer;
begin
  Result := '';
  L := Length(Line);
  if L >= OffsetAfter then
    Result := Trim(Copy(Line, OffsetAfter, L - OffsetAfter + 1));
end;

function DetectExternalIP(const ExePath: String; out ExtIP, ExtIP6, LocIP: String): Boolean;
var
  ResultCode: Integer;
  Output: AnsiString;
  Line: String;
  P, StartIdx: Integer;
  DetectPath: String;
begin
  Result := False;
  ExtIP := '';
  ExtIP6 := '';
  LocIP := '';

  if not FileExists(ExePath) then Exit;

  DetectPath := ExpandConstant('{tmp}') + '\' + DetectFile;
  DeleteFile(DetectPath);

  if not Exec(ExePath, '-detect-external-ip', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
    Exit;

  if not FileExists(DetectPath) then Exit;

  if not LoadStringFromFile(DetectPath, Output) then Exit;

  StartIdx := 1;
  while StartIdx <= Length(Output) do
  begin
    P := Pos(#10, Copy(Output, StartIdx, Length(Output) - StartIdx + 1));
    if P = 0 then
    begin
      Line := Trim(Copy(Output, StartIdx, Length(Output) - StartIdx + 1));
      StartIdx := Length(Output) + 1;
    end
    else
    begin
      Line := Trim(Copy(Output, StartIdx, P - 1));
      StartIdx := StartIdx + P;
    end;

    if Pos('EXTERNAL_IP=', Line) = 1 then
    begin
      ExtIP := ParseValue(Line, 'EXTERNAL_IP=', 13);
    end
    else if Pos('EXTERNAL_IP6=', Line) = 1 then
    begin
      ExtIP6 := ParseValue(Line, 'EXTERNAL_IP6=', 14);
    end
    else if Pos('LOCAL_IP=', Line) = 1 then
    begin
      LocIP := ParseValue(Line, 'LOCAL_IP=', 10);
    end;
  end;

  Result := (LocIP <> '');
  DeleteFile(DetectPath);
end;

procedure InitializeWizard;
var
  ExePath: String;
begin
  GatewayPort := '8765';
  HasExternalIP := False;
  ExternalIP := '';
  ExternalIP6 := '';
  LocalIP := '';

  ExePath := ExpandConstant('{src}\dist\{#MyAppExeName}');

  if FileExists(ExePath) then
  begin
    DetectExternalIP(ExePath, ExternalIP, ExternalIP6, LocalIP);
  end;

  NetworkPage := CreateInputQueryPage(wpSelectDir,
    'Network Setup',
    'How should your phone reach this PC?',
    'GOpencode runs a gateway on this PC. Your phone will connect to it over WebSocket.' + #10#10 +
    'If you are on the SAME WiFi as this PC, the auto-detected local IP works and you don''t need to do anything else.' + #10#10 +
    'If you want to reach this PC from outside your home (cellular, public WiFi, etc.), you need a public address. The setup tried to detect one above. If it came back blank, your router likely has UPnP disabled or doesn''t support it - you''ll need to forward a port manually (the final page explains how).' + #10#10 +
    'Detected public IPv4: ' + ExternalIP + #10 +
    'Detected public IPv6: ' + ExternalIP6);

  if ExternalIP <> '' then
  begin
    NetworkPage.Add('&Public IPv4 (auto-detected - blank to skip):', False);
    NetworkPage.Values[0] := ExternalIP;
    HasExternalIP := True;
  end
  else if ExternalIP6 <> '' then
  begin
    NetworkPage.Add('&Public IPv6 (auto-detected - blank to skip). Your phone needs IPv6 to use this.:', False);
    NetworkPage.Values[0] := ExternalIP6;
    HasExternalIP := True;
  end
  else
  begin
    NetworkPage.Add('&Public IP (blank = local network only):', False);
    NetworkPage.Values[0] := '';
    HasExternalIP := False;
  end;

  PortPage := CreateInputQueryPage(NetworkPage.ID,
    'Gateway Port',
    'Which port should the gateway use?',
    'The gateway listens on this port for your phone. Pick any free port between 1024 and 65535.' + #10#10 +
    'If you want to reach this PC from OUTSIDE your home network, the port you choose here is the one that must be forwarded in your router (the final page explains how).' + #10#10 +
    'Default: 8765');

  PortPage.Add('&Gateway Port:', False);
  PortPage.Values[0] := GatewayPort;

  SummaryPage := CreateOutputMsgPage(PortPage.ID,
    'Done',
    'GOpencode is ready to install',
    '');
end;

function GetNetworkHelpText: String;
var
  PortStr: String;
begin
  PortStr := PortPage.Values[0];
  Result :=
    'You said you have NO public IP (UPnP didn''t work, or your router doesn''t support it).' + #10#10 +
    'If you only ever need to use GOpencode from your phone on the SAME WiFi as this PC, you can skip the rest of this page - the install will work fine for that.' + #10#10 +
    'If you want to reach this PC from outside your home (cellular, another WiFi, work, etc.), you need to forward port ' + PortStr + ' on your router. Here''s how:' + #10#10 +
    '1. Open a browser and go to your router''s admin page. Most routers are at one of these:' + #10 +
    '   - http://192.168.1.1' + #10 +
    '   - http://192.168.0.1' + #10 +
    '   - http://192.168.1.254' + #10 +
    '   (Check the label on the router or its manual for the exact address.)' + #10#10 +
    '2. Log in with your router admin password (often on a sticker on the router).' + #10#10 +
    '3. Find the section called "Port Forwarding", "Virtual Server", "NAT Forwarding", or "Firewall". Every router calls it something slightly different. It''s usually under Advanced settings.' + #10#10 +
    '4. Add a new rule:' + #10 +
    '   - Service name: GOpencode' + #10 +
    '   - Protocol: TCP (or BOTH/TCP+UDP if there''s a choice)' + #10 +
    '   - External port (or "Start port"): ' + PortStr + #10 +
    '   - Internal port: ' + PortStr + #10 +
    '   - Internal IP / Device: ' + LocalIP + '   (this PC''s local IP - auto-detected)' + #10 +
    '   - Save / Apply' + #10#10 +
    '5. Find your public IP: go to https://whatismyip.com in a browser on this PC. That''s the address your phone will connect to.' + #10#10 +
    '6. You can type that public IP into the field on the previous page, OR set it later in the GOpencode Settings window (right-click the tray icon).' + #10#10 +
    'Note: some ISPs use "CGNAT" - your home router does not actually have a public IP. If after forwarding a port you still can''t reach the PC, search your ISP + "CGNAT" - you may need to call them and ask for a public IP, or use a Tailscale-style service.';
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  TmpStr: String;
  PortInt: Integer;
begin
  Result := True;

  if CurPageID = NetworkPage.ID then
  begin
    TmpStr := NetworkPage.Values[0];
    if TmpStr = '' then
    begin
      ExternalIP := '';
      HasExternalIP := False;
    end
    else
    begin
      ExternalIP := TmpStr;
      HasExternalIP := True;
    end;
  end;

  if CurPageID = PortPage.ID then
  begin
    TmpStr := PortPage.Values[0];
    PortInt := StrToIntDef(TmpStr, 0);
    if (Length(TmpStr) = 0) or (PortInt = 0) then
    begin
      MsgBox('Please enter a valid port number (1024-65535).', mbError, MB_OK);
      Result := False;
    end
    else if (PortInt < 1024) or (PortInt > 65535) then
    begin
      MsgBox('Port must be between 1024 and 65535.', mbError, MB_OK);
      Result := False;
    end
    else
    begin
      GatewayPort := TmpStr;
      if (not HasExternalIP) and (LocalIP <> '') then
      begin
        SummaryPage.Description := GetNetworkHelpText;
      end
      else
      begin
        SummaryPage.Description := 'GOpencode will start a gateway on port ' + GatewayPort +
          ' and bind to all interfaces. Your phone can reach it at:' + #10#10 +
          '  - On the same WiFi: ws://' + LocalIP + ':' + GatewayPort + #10 +
          '  - From outside (if public IP works): ws://' + ExternalIP + ':' + GatewayPort + #10#10 +
          'Click Install to write the config and copy files.';
      end;
    end;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ConfigPath: String;
  ConfigText: String;
  ResultCode: Integer;
begin
  if CurStep = ssInstall then
  begin
    Exec('taskkill.exe', '/F /IM gopencode.exe', '', SW_HIDE, ewNoWait, ResultCode);
  end;

  if CurStep = ssPostInstall then
  begin
    ConfigPath := ExpandConstant('{userappdata}\' + AppDataRelPath);
    ForceDirectories(ExtractFilePath(ConfigPath));

    ConfigText :=
      '{\' + #10 +
      '  "port": ' + GatewayPort + ',\' + #10 +
      '  "ocUrl": "http://127.0.0.1:4096",\' + #10 +
      '  "username": "opencode",\' + #10 +
      '  "password": "",\' + #10 +
      '  "autoStart": false,\' + #10 +
      '  "host": "' + ExternalIP + '",\' + #10 +
      '  "headless": false\' + #10 +
      '}';

    SaveStringToFile(ConfigPath, ConfigText, False);
  end;
end;
