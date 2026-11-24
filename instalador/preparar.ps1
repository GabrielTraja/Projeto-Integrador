# ==========================================================================
#  PREPARA E COMPILA O INSTALADOR DO NEXGUSTO PDV
#  Uso (na raiz do projeto):  npm run instalador
#  Requisitos na máquina do desenvolvedor: Node.js/npm e Inno Setup 6
#  (https://jrsoftware.org/isdl.php). Os componentes de terceiros (Node portátil,
#  MariaDB e WinSW) são baixados nas versões fixadas abaixo e guardados em cache.
# ==========================================================================
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$NodeVersao    = '22.11.0'
$MariaDBVersao = '11.4.4'
$WinSWVersao   = '2.12.0'

$Instalador = $PSScriptRoot
$Raiz       = Split-Path $Instalador -Parent
$Build      = Join-Path $Instalador 'build'
$Downloads  = Join-Path $Build 'downloads'

function Escrever-Etapa($texto) { Write-Host "`n==> $texto" -ForegroundColor Cyan }

function Baixar($url, $destino) {
    if (Test-Path $destino) { Write-Host "   (cache) $(Split-Path $destino -Leaf)"; return }
    Write-Host "   baixando $url"
    $temporario = "$destino.parcial"
    $curl = Join-Path $env:SystemRoot 'System32\curl.exe'
    if (Test-Path $curl) {
        # curl.exe (nativo do Windows 10+) é mais confiável que o Invoke-WebRequest do PowerShell 5.1
        # Retoma downloads interrompidos (--continue-at -) em até 10 tentativas
        $sucesso = $false
        for ($tentativa = 1; $tentativa -le 10 -and -not $sucesso; $tentativa++) {
            & $curl --fail --location --silent --show-error --continue-at - --output $temporario $url
            if ($LASTEXITCODE -eq 0) { $sucesso = $true }
            else { Write-Host "   conexão interrompida, retomando (tentativa $tentativa)..."; Start-Sleep -Seconds 3 }
        }
        if (-not $sucesso) { throw "Falha ao baixar $url" }
    } else {
        Invoke-WebRequest -Uri $url -OutFile $temporario -UseBasicParsing
    }
    Move-Item $temporario $destino -Force
}

function Extrair-Zip($zip, $destino) {
    $temporario = Join-Path $Build ('extrair_' + [IO.Path]::GetFileNameWithoutExtension($zip))
    if (Test-Path $temporario) { Remove-Item $temporario -Recurse -Force }
    Expand-Archive -Path $zip -DestinationPath $temporario
    $interna = Get-ChildItem $temporario -Directory | Select-Object -First 1
    if (Test-Path $destino) { Remove-Item $destino -Recurse -Force }
    # O antivírus pode bloquear a pasta recém-extraída por alguns segundos:
    # tenta mover algumas vezes e, se não conseguir, copia.
    $movido = $false
    for ($tentativa = 1; $tentativa -le 5 -and -not $movido; $tentativa++) {
        try {
            Move-Item $interna.FullName $destino -ErrorAction Stop
            $movido = $true
        } catch {
            Start-Sleep -Seconds 3
        }
    }
    if (-not $movido) {
        if (Test-Path $destino) { Remove-Item $destino -Recurse -Force }
        Copy-Item $interna.FullName $destino -Recurse
    }
    Remove-Item $temporario -Recurse -Force -ErrorAction SilentlyContinue
}

# --------------------------------------------------------------------------
Escrever-Etapa 'Conferindo versão e chave pública'
$pacote = Get-Content (Join-Path $Raiz 'backend\package.json') -Raw | ConvertFrom-Json
$Versao = $pacote.version
$versaoJs = Get-Content (Join-Path $Raiz 'backend\src\versao.js') -Raw
if ($versaoJs -notmatch "lancamento:\s*'(\d{4}-\d{2}-\d{2})'") { throw 'Data de lançamento não encontrada em backend/src/versao.js' }
$Lancamento = $Matches[1]
if (-not (Test-Path (Join-Path $Raiz 'backend\src\license\chavePublica.js'))) {
    throw 'backend/src/license/chavePublica.js não existe. Execute: npm run licenca -- chaves'
}
Write-Host "   versão $Versao, lançada em $Lancamento"

New-Item -ItemType Directory -Force $Downloads | Out-Null

# --------------------------------------------------------------------------
Escrever-Etapa 'Copiando aplicação'
$App = Join-Path $Build 'app'
if (Test-Path $App) { Remove-Item $App -Recurse -Force }
New-Item -ItemType Directory -Force (Join-Path $App 'backend') | Out-Null

Copy-Item (Join-Path $Raiz 'frontend') (Join-Path $App 'frontend') -Recurse
foreach ($item in 'server.js', 'package.json', 'package-lock.json') {
    Copy-Item (Join-Path $Raiz "backend\$item") (Join-Path $App 'backend')
}
Copy-Item (Join-Path $Raiz 'backend\src') (Join-Path $App 'backend\src') -Recurse

$proibidos = Get-ChildItem $App -Recurse -File | Where-Object {
    $_.Name -like '*.pem' -or $_.Name -like 'chave-privada*' -or $_.Name -eq '.env' -or $_.Name -like 'licencas-emitidas*'
}
if ($proibidos) { throw "Arquivos sensíveis encontrados no pacote: $($proibidos.FullName -join ', ')" }

Escrever-Etapa 'Instalando dependências de produção'
Push-Location (Join-Path $App 'backend')
try {
    & npm ci --omit=dev --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'npm ci falhou' }
} finally { Pop-Location }

# --------------------------------------------------------------------------
Escrever-Etapa "Node.js portátil $NodeVersao"
$zipNode = Join-Path $Downloads "node-v$NodeVersao-win-x64.zip"
Baixar "https://nodejs.org/dist/v$NodeVersao/node-v$NodeVersao-win-x64.zip" $zipNode
Extrair-Zip $zipNode (Join-Path $Build 'node')
# Só o executável é necessário em produção
Get-ChildItem (Join-Path $Build 'node') | Where-Object { $_.Name -ne 'node.exe' -and $_.Name -ne 'LICENSE' } |
    Remove-Item -Recurse -Force

Escrever-Etapa "MariaDB $MariaDBVersao"
$zipMaria = Join-Path $Downloads "mariadb-$MariaDBVersao-winx64.zip"
Baixar "https://archive.mariadb.org/mariadb-$MariaDBVersao/winx64-packages/mariadb-$MariaDBVersao-winx64.zip" $zipMaria
$Maria = Join-Path $Build 'mariadb'
Extrair-Zip $zipMaria $Maria
foreach ($pasta in 'include', 'mysql-test', 'sql-bench', 'data') {
    $caminho = Join-Path $Maria $pasta
    if (Test-Path $caminho) { Remove-Item $caminho -Recurse -Force }
}
Get-ChildItem $Maria -Recurse -Include '*.pdb', '*.lib' | Remove-Item -Force

Escrever-Etapa "WinSW $WinSWVersao (serviço do Windows)"
$WinSW = Join-Path $Build 'winsw'
New-Item -ItemType Directory -Force $WinSW | Out-Null
Baixar "https://github.com/winsw/winsw/releases/download/v$WinSWVersao/WinSW-x64.exe" (Join-Path $Downloads "WinSW-x64-$WinSWVersao.exe")
Copy-Item (Join-Path $Downloads "WinSW-x64-$WinSWVersao.exe") (Join-Path $WinSW 'WinSW-x64.exe') -Force

# --------------------------------------------------------------------------
Escrever-Etapa 'Gerando ícone a partir do logotipo'
Add-Type -AssemblyName System.Drawing
$logo = [System.Drawing.Image]::FromFile((Join-Path $Raiz 'frontend\icones\logo.png'))
$tamanho = 256
$bitmap = New-Object System.Drawing.Bitmap $tamanho, $tamanho
$grafico = [System.Drawing.Graphics]::FromImage($bitmap)
$grafico.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$grafico.Clear([System.Drawing.Color]::Transparent)
# Usa só o símbolo "N" (parte quadrada à esquerda do logotipo); o texto ficaria ilegível no ícone
$lado = [Math]::Min($logo.Width, $logo.Height)
$origem = New-Object System.Drawing.Rectangle 0, 0, $lado, $lado
$destinoIcone = New-Object System.Drawing.Rectangle 0, 0, $tamanho, $tamanho
$grafico.DrawImage($logo, $destinoIcone, $origem, [System.Drawing.GraphicsUnit]::Pixel)
$memoria = New-Object IO.MemoryStream
$bitmap.Save($memoria, [System.Drawing.Imaging.ImageFormat]::Png)
$png = $memoria.ToArray()
$grafico.Dispose(); $bitmap.Dispose(); $logo.Dispose()
# Arquivo .ico com uma imagem PNG 256x256 (suportado desde o Windows Vista)
$ico = New-Object IO.MemoryStream
$escritor = New-Object IO.BinaryWriter $ico
$escritor.Write([UInt16]0); $escritor.Write([UInt16]1); $escritor.Write([UInt16]1)
$escritor.Write([byte]0); $escritor.Write([byte]0); $escritor.Write([byte]0); $escritor.Write([byte]0)
$escritor.Write([UInt16]1); $escritor.Write([UInt16]32)
$escritor.Write([UInt32]$png.Length); $escritor.Write([UInt32]22)
$escritor.Write($png)
[IO.File]::WriteAllBytes((Join-Path $Build 'nexgusto.ico'), $ico.ToArray())

# --------------------------------------------------------------------------
Escrever-Etapa 'Compilando instalador (Inno Setup)'
$iscc = @(
    "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
    "$env:ProgramFiles\Inno Setup 6\ISCC.exe",
    "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $iscc) {
    Write-Host "`nInno Setup 6 não encontrado. Instale em https://jrsoftware.org/isdl.php e execute novamente." -ForegroundColor Yellow
    Write-Host "Os arquivos preparados estão em: $Build"
    exit 1
}

& $iscc "/DAppVersion=$Versao" (Join-Path $Instalador 'nexgusto.iss')
if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar o instalador.' }
Write-Host "`nInstalador gerado em: $(Join-Path $Instalador 'saida')" -ForegroundColor Green
