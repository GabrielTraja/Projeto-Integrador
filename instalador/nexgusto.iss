; ==========================================================================
;  INSTALADOR DO NEXGUSTO PDV (Inno Setup 6)
;  Gere pelo script:  npm run instalador   (prepara a pasta build\ e compila)
;
;  Programa : C:\Program Files\NexGusto PDV        (substituído a cada versão)
;  Dados    : C:\ProgramData\NexGusto              (NUNCA removido)
;             config\.env, banco\, uploads\, backups\, logs\, licenca\
;  Serviços : NexGustoBanco (MariaDB, porta 3307)  e  NexGustoServidor (Node, porta 3000)
; ==========================================================================

#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif
#define AppName "NexGusto PDV"
#define AppPort "3000"
#define DbPort "3307"

[Setup]
AppId={{737EF940-594E-45F2-A41D-A88E243670B1}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher=[SEU NOME OU EMPRESA]
DefaultDirName={autopf}\{#AppName}
DisableProgramGroupPage=yes
DisableDirPage=auto
LicenseFile=termos-de-uso.txt
OutputDir=saida
OutputBaseFilename=NexGusto-PDV-Setup-{#AppVersion}
SetupIconFile=build\nexgusto.ico
UninstallDisplayIcon={app}\nexgusto.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
CloseApplications=no

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Tasks]
Name: "atalho"; Description: "Criar atalho na área de trabalho"
Name: "rede"; Description: "Permitir que outros computadores da rede acessem o sistema (caixa e gerência em máquinas diferentes)"; Flags: unchecked

[Dirs]
Name: "{commonappdata}\NexGusto"; Flags: uninsneveruninstall
Name: "{commonappdata}\NexGusto\config"; Flags: uninsneveruninstall
Name: "{commonappdata}\NexGusto\uploads"; Flags: uninsneveruninstall
Name: "{commonappdata}\NexGusto\backups"; Flags: uninsneveruninstall
Name: "{commonappdata}\NexGusto\logs"; Flags: uninsneveruninstall

[InstallDelete]
; Remove arquivos da versão anterior do programa (os dados ficam em ProgramData)
Type: filesandordirs; Name: "{app}\app"

[Files]
Source: "build\app\*"; DestDir: "{app}\app"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "build\node\*"; DestDir: "{app}\node"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "build\mariadb\*"; DestDir: "{app}\mariadb"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "build\winsw\WinSW-x64.exe"; DestDir: "{app}\servico"; DestName: "NexGustoServidor.exe"; Flags: ignoreversion
Source: "recursos\backup.cmd"; DestDir: "{app}\ferramentas"; Flags: ignoreversion
Source: "build\nexgusto.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "termos-de-uso.txt"; DestDir: "{app}"; Flags: ignoreversion

[INI]
Filename: "{app}\NexGusto PDV.url"; Section: "InternetShortcut"; Key: "URL"; String: "http://localhost:{#AppPort}"
Filename: "{app}\NexGusto PDV.url"; Section: "InternetShortcut"; Key: "IconFile"; String: "{app}\nexgusto.ico"
Filename: "{app}\NexGusto PDV.url"; Section: "InternetShortcut"; Key: "IconIndex"; String: "0"

[Icons]
Name: "{commondesktop}\{#AppName}"; Filename: "{app}\NexGusto PDV.url"; IconFilename: "{app}\nexgusto.ico"; Tasks: atalho
Name: "{autoprograms}\{#AppName}\{#AppName}"; Filename: "{app}\NexGusto PDV.url"; IconFilename: "{app}\nexgusto.ico"
Name: "{autoprograms}\{#AppName}\Fazer backup agora"; Filename: "{app}\ferramentas\backup.cmd"
Name: "{autoprograms}\{#AppName}\Abrir pasta de backups"; Filename: "{commonappdata}\NexGusto\backups"

[Run]
Filename: "{app}\NexGusto PDV.url"; Description: "Abrir o {#AppName}"; Flags: postinstall shellexec nowait skipifsilent

[UninstallDelete]
Type: files; Name: "{app}\NexGusto PDV.url"
Type: files; Name: "{app}\servico\NexGustoServidor.xml"
Type: filesandordirs; Name: "{app}\servico"

[Code]
const
  SERVICO_BANCO = 'NexGustoBanco';
  SERVICO_APP = 'NexGustoServidor';
  TAREFA_BACKUP = 'NexGusto Backup Diario';
  REGRA_FIREWALL = 'NexGusto PDV';

var
  EhAtualizacao: Boolean;

function PastaDados(): String;
begin
  Result := ExpandConstant('{commonappdata}\NexGusto');
end;

function ArquivoConfig(): String;
begin
  Result := PastaDados() + '\config\.env';
end;

function Executar(const Programa, Parametros: String): Integer;
var
  Codigo: Integer;
begin
  if not Exec(Programa, Parametros, '', SW_HIDE, ewWaitUntilTerminated, Codigo) then
    Codigo := -1;
  Log('Executado: ' + Programa + ' ' + Parametros + ' => ' + IntToStr(Codigo));
  Result := Codigo;
end;

function ServicoExiste(const Nome: String): Boolean;
begin
  Result := Executar(ExpandConstant('{sys}\sc.exe'), 'query ' + Nome) = 0;
end;

procedure PararServico(const Nome: String);
begin
  if ServicoExiste(Nome) then
    Executar(ExpandConstant('{sys}\net.exe'), 'stop ' + Nome);
end;

function GerarSegredo(): String;
begin
  Result := GetSHA1OfString(GetDateTimeString('yyyymmddhhnnsszzz', #0, #0) + IntToStr(Random(2147483647)) +
    ExpandConstant('{computername}')) +
    GetSHA1OfString(IntToStr(Random(2147483647)) + GetDateTimeString('zzzsshhnn', #0, #0));
end;

function LerValorConfig(const Chave: String): String;
var
  Linhas: TArrayOfString;
  I: Integer;
begin
  Result := '';
  if LoadStringsFromFile(ArquivoConfig(), Linhas) then
    for I := 0 to GetArrayLength(Linhas) - 1 do
      if Pos(Chave + '=', Linhas[I]) = 1 then
        Result := Copy(Linhas[I], Length(Chave) + 2, Length(Linhas[I]));
end;

procedure CriarConfiguracao(const SenhaBanco: String);
var
  Conteudo: String;
begin
  Conteudo :=
    '# Gerado pelo instalador do NexGusto PDV. Não compartilhe este arquivo.' + #13#10 +
    'DB_HOST=127.0.0.1' + #13#10 +
    'DB_PORT={#DbPort}' + #13#10 +
    'DB_USER=root' + #13#10 +
    'DB_PASS=' + SenhaBanco + #13#10 +
    'DB_NAME=pdv' + #13#10 +
    'PORT={#AppPort}' + #13#10 +
    'AUTH_TOKEN_SECRET=' + GerarSegredo() + #13#10;
  ForceDirectories(PastaDados() + '\config');
  SaveStringToFile(ArquivoConfig(), Conteudo, False);
  // Somente SYSTEM e Administradores podem ler a senha do banco
  Executar(ExpandConstant('{sys}\icacls.exe'), '"' + PastaDados() + '\config" /inheritance:r /grant:r *S-1-5-18:(OI)(CI)F *S-1-5-32-544:(OI)(CI)F');
end;

procedure ConfigurarBanco();
var
  App, Banco, Senha, Servidor: String;
begin
  if ServicoExiste(SERVICO_BANCO) then
    Exit;

  App := ExpandConstant('{app}');
  Banco := PastaDados() + '\banco';

  if FileExists(Banco + '\my.ini') then
  begin
    // Reinstalação: o banco já existe, apenas registra o serviço novamente
    Servidor := App + '\mariadb\bin\mariadbd.exe';
    if not FileExists(Servidor) then
      Servidor := App + '\mariadb\bin\mysqld.exe';
    Executar(Servidor, '--install ' + SERVICO_BANCO + ' --defaults-file="' + Banco + '\my.ini"');
  end
  else
  begin
    Senha := LerValorConfig('DB_PASS');
    if Senha = '' then
    begin
      Senha := Copy(GerarSegredo(), 1, 32);
      CriarConfiguracao(Senha);
    end;
    if Executar(App + '\mariadb\bin\mariadb-install-db.exe',
      '--datadir="' + Banco + '" --service=' + SERVICO_BANCO + ' --port={#DbPort} --password=' + Senha) <> 0 then
      MsgBox('Não foi possível criar o banco de dados. Consulte o log da instalação.', mbError, MB_OK);
  end;
end;

procedure ConfigurarServidor();
var
  App, Xml: String;
begin
  App := ExpandConstant('{app}');
  Xml :=
    '<service>' + #13#10 +
    '  <id>' + SERVICO_APP + '</id>' + #13#10 +
    '  <name>NexGusto PDV - Servidor</name>' + #13#10 +
    '  <description>Servidor do sistema NexGusto PDV (http://localhost:{#AppPort})</description>' + #13#10 +
    '  <executable>' + App + '\node\node.exe</executable>' + #13#10 +
    '  <arguments>"' + App + '\app\backend\server.js"</arguments>' + #13#10 +
    '  <workingdirectory>' + App + '\app\backend</workingdirectory>' + #13#10 +
    '  <env name="NODE_ENV" value="production"/>' + #13#10 +
    '  <env name="NEXGUSTO_CONFIG" value="' + ArquivoConfig() + '"/>' + #13#10 +
    '  <env name="NEXGUSTO_DATA_DIR" value="' + PastaDados() + '"/>' + #13#10 +
    '  <depend>' + SERVICO_BANCO + '</depend>' + #13#10 +
    '  <startmode>Automatic</startmode>' + #13#10 +
    '  <onfailure action="restart" delay="10 sec"/>' + #13#10 +
    '  <resetfailure>1 hour</resetfailure>' + #13#10 +
    '  <logpath>' + PastaDados() + '\logs</logpath>' + #13#10 +
    '  <log mode="roll-by-size"><sizeThreshold>10240</sizeThreshold><keepFiles>5</keepFiles></log>' + #13#10 +
    '</service>' + #13#10;
  SaveStringToFile(App + '\servico\NexGustoServidor.xml', Xml, False);

  if not ServicoExiste(SERVICO_APP) then
    Executar(App + '\servico\NexGustoServidor.exe', 'install');
end;

procedure ConfigurarTarefasDoSistema();
var
  App: String;
begin
  App := ExpandConstant('{app}');
  Executar(ExpandConstant('{sys}\schtasks.exe'),
    '/Create /F /TN "' + TAREFA_BACKUP + '" /SC DAILY /ST 12:30 /RU SYSTEM /RL HIGHEST /TR "\"' +
    App + '\ferramentas\backup.cmd\""');

  Executar(ExpandConstant('{sys}\netsh.exe'), 'advfirewall firewall delete rule name="' + REGRA_FIREWALL + '"');
  if WizardIsTaskSelected('rede') then
    Executar(ExpandConstant('{sys}\netsh.exe'),
      'advfirewall firewall add rule name="' + REGRA_FIREWALL + '" dir=in action=allow protocol=TCP localport={#AppPort} profile=private,domain');
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  Backup: String;
begin
  Result := '';
  EhAtualizacao := ServicoExiste(SERVICO_APP);
  if not EhAtualizacao then
    Exit;

  // Atualização: cópia de segurança antes de substituir os arquivos
  Backup := ExpandConstant('{app}\ferramentas\backup.cmd');
  if FileExists(Backup) then
  begin
    WizardForm.PreparingLabel.Caption := 'Fazendo cópia de segurança dos dados...';
    if Executar(ExpandConstant('{cmd}'), '/C ""' + Backup + '""') <> 0 then
      if SuppressibleMsgBox('Não foi possível fazer a cópia de segurança automática antes da atualização.' + #13#10 +
        'Deseja continuar mesmo assim?', mbConfirmation, MB_YESNO, IDNO) = IDNO then
      begin
        Result := 'Atualização cancelada para preservar seus dados.';
        Exit;
      end;
  end;

  PararServico(SERVICO_APP);
  PararServico(SERVICO_BANCO);
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    WizardForm.StatusLabel.Caption := 'Configurando banco de dados e serviços...';
    if not FileExists(ArquivoConfig()) and not FileExists(PastaDados() + '\banco\my.ini') then
      CriarConfiguracao(Copy(GerarSegredo(), 1, 32));
    ConfigurarBanco();
    ConfigurarServidor();
    ConfigurarTarefasDoSistema();

    WizardForm.StatusLabel.Caption := 'Iniciando o sistema...';
    Executar(ExpandConstant('{sys}\net.exe'), 'start ' + SERVICO_BANCO);
    Executar(ExpandConstant('{sys}\net.exe'), 'start ' + SERVICO_APP);
    // Aguarda o servidor criar/atualizar as tabelas antes de abrir o navegador
    Sleep(5000);
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  App: String;
begin
  if CurUninstallStep = usUninstall then
  begin
    App := ExpandConstant('{app}');
    PararServico(SERVICO_APP);
    if FileExists(App + '\servico\NexGustoServidor.exe') then
      Executar(App + '\servico\NexGustoServidor.exe', 'uninstall');
    PararServico(SERVICO_BANCO);
    Executar(ExpandConstant('{sys}\sc.exe'), 'delete ' + SERVICO_BANCO);
    Executar(ExpandConstant('{sys}\schtasks.exe'), '/Delete /F /TN "' + TAREFA_BACKUP + '"');
    Executar(ExpandConstant('{sys}\netsh.exe'), 'advfirewall firewall delete rule name="' + REGRA_FIREWALL + '"');
  end;
  if CurUninstallStep = usDone then
    MsgBox('O NexGusto PDV foi removido.' + #13#10#13#10 +
      'Seus dados e cópias de segurança foram mantidos em:' + #13#10 + PastaDados(), mbInformation, MB_OK);
end;
