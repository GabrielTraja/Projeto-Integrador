@echo off
REM ==========================================================================
REM  CÓPIA DE SEGURANÇA DO NEXGUSTO PDV
REM  Executado diariamente pelo Agendador de Tarefas e antes de cada atualização.
REM  Saída: %ProgramData%\NexGusto\backups (mantém os 30 arquivos mais recentes)
REM ==========================================================================
setlocal EnableExtensions
set "APP=%~dp0.."
set "DADOS=%ProgramData%\NexGusto"
set "CONFIG=%DADOS%\config\.env"
set "DESTINO=%DADOS%\backups"

if not exist "%CONFIG%" (
    echo Arquivo de configuracao nao encontrado: %CONFIG%
    exit /b 2
)

for /f "usebackq eol=# tokens=1,* delims==" %%a in ("%CONFIG%") do set "%%a=%%b"
if not defined DB_PORT set "DB_PORT=3307"

for /f %%d in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HHmmss"') do set "CARIMBO=%%d"
if not exist "%DESTINO%" mkdir "%DESTINO%"

set "ARQUIVO=%DESTINO%\pdv_%CARIMBO%.sql"
set "MYSQL_PWD=%DB_PASS%"
"%APP%\mariadb\bin\mariadb-dump.exe" --host=127.0.0.1 --port=%DB_PORT% --user=%DB_USER% ^
    --single-transaction --routines --triggers --default-character-set=utf8mb4 ^
    --databases %DB_NAME% > "%ARQUIVO%" 2> "%DESTINO%\ultimo_erro.txt"
set "RESULTADO=%ERRORLEVEL%"
set "MYSQL_PWD="

if not "%RESULTADO%"=="0" (
    del "%ARQUIVO%" >nul 2>&1
    echo Falha no backup do banco de dados. Veja %DESTINO%\ultimo_erro.txt
    exit /b 1
)
del "%DESTINO%\ultimo_erro.txt" >nul 2>&1

REM Fotos de produtos, logotipo e avatares
if exist "%DADOS%\uploads" robocopy "%DADOS%\uploads" "%DESTINO%\uploads" /MIR /R:1 /W:1 /NFL /NDL /NJH /NJS /NP >nul

REM Mantém somente os 30 backups mais recentes
powershell -NoProfile -Command "Get-ChildItem -Path '%DESTINO%' -Filter 'pdv_*.sql' | Sort-Object LastWriteTime -Descending | Select-Object -Skip 30 | Remove-Item -Force"

echo Backup concluido: %ARQUIVO%
exit /b 0
