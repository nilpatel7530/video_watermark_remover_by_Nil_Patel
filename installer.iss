; Inno Setup Compiler Script for Video Watermark Remover by SNP Solutions
; This script compiles the PyInstaller output directory into a single setup installer executable.

#define MyAppName "Video Watermark Remover"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "SNP Solutions"
#define MyAppURL "https://snpsolutions.com"
#define MyAppExeName "Video_Watermark_Remover_SNP_Solutions.exe"

[Setup]
; Unique GUID for this installer
AppId={{5A8C9B23-C4A1-4F28-868E-758CE6B500C5}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={userappdata}\{#MyAppPublisher}\{#MyAppName}
DisableProgramGroupPage=yes
; 'lowest' privileges required so that any user can install without administrator prompts (1-click installer)
PrivilegesRequired=lowest
OutputDir=dist
OutputBaseFilename=Video_Watermark_Remover_Setup
Compression=lzma
SolidCompression=yes
WizardStyle=modern

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "dist\Video_Watermark_Remover_SNP_Solutions.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent
