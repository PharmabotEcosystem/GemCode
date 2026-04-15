param(
    [string]$BackendBaseUrl,
    [string]$BridgeUrl = "http://127.0.0.1:10301",
    [int]$PreferredSitePort = 3000,
    [switch]$SkipBackendCheck,
    [switch]$NoOpenBrowser,
    [switch]$NoAutoFlash
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$settingsFile = Join-Path $PSScriptRoot "gemcode_voice_bridge_settings.json"
$secretsFile = Join-Path $repoRoot "docs\secrets.yaml"
$logRoot = Join-Path $env:TEMP "GemCodeQuickStart"
$isWindowsHost = $env:OS -eq 'Windows_NT'
New-Item -ItemType Directory -Path $logRoot -Force | Out-Null

function Write-Step {
    param([string]$Message)
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Info {
    param([string]$Message)
    Write-Host "    $Message" -ForegroundColor Gray
}

function Test-CommandAvailable {
    param([string]$Name)
    return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Get-RepoPythonExecutable {
    $candidates = @(
        (Join-Path $repoRoot '.venv-1\Scripts\python.exe'),
        (Join-Path $repoRoot '.venv\Scripts\python.exe')
    )

    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            return $candidate
        }
    }

    $pythonCmd = Get-Command python -ErrorAction SilentlyContinue
    if ($pythonCmd) {
        return $pythonCmd.Source
    }

    throw 'Nessun interprete Python trovato. Attiva o crea prima il virtualenv del repo.'
}

function Test-TcpPortInUse {
    param([int]$Port)
    $listeners = [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()
    return $listeners.Port -contains $Port
}

function Get-FreeTcpPort {
    param([int]$StartPort, [int]$EndPort = 3010)
    foreach ($port in $StartPort..$EndPort) {
        if (-not (Test-TcpPortInUse -Port $port)) {
            return $port
        }
    }
    throw "Nessuna porta libera trovata tra $StartPort e $EndPort."
}

function Get-ListeningProcessId {
    param([int]$Port)

    try {
        $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop | Select-Object -First 1
        if ($connection) {
            return [int]$connection.OwningProcess
        }
    } catch {
        $netstatLine = netstat -ano | Select-String ":$Port\s+.*LISTENING\s+(\d+)" | Select-Object -First 1
        if ($netstatLine -and $netstatLine.Matches.Count -gt 0) {
            return [int]$netstatLine.Matches[0].Groups[1].Value
        }
    }

    return $null
}

function Get-ProcessCommandLine {
    param([int]$ProcessId)

    try {
        return [string](Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId").CommandLine
    } catch {
        return ""
    }
}

function Test-HttpEndpoint {
    param(
        [string]$Url,
        [int]$TimeoutSec = 3,
        [string]$ContentMatch
    )

    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec $TimeoutSec -ErrorAction Stop
        if ($ContentMatch) {
            return $response.StatusCode -ge 200 -and $response.StatusCode -lt 400 -and $response.Content -match $ContentMatch
        }
        return $response.StatusCode -ge 200 -and $response.StatusCode -lt 400
    } catch {
        return $false
    }
}

function Get-Json {
    param([string]$Url, [int]$TimeoutSec = 4)
    return Invoke-RestMethod -Uri $Url -TimeoutSec $TimeoutSec -ErrorAction Stop
}

function Wait-Until {
    param(
        [scriptblock]$Condition,
        [int]$TimeoutSec,
        [string]$Description
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        if (& $Condition) {
            return
        }
        Start-Sleep -Seconds 1
    }

    throw "Timeout durante l'attesa di $Description."
}

function Get-BridgeHostFromSecrets {
    if (-not (Test-Path $secretsFile)) {
        return $null
    }

    foreach ($line in Get-Content $secretsFile) {
        if ($line -match '^\s*gemcode_bridge_host:\s*"?([^"#]+)') {
            return $matches[1].Trim()
        }
    }

    return $null
}

function Get-WifiSsidFromSecrets {
    if (-not (Test-Path $secretsFile)) {
        return $null
    }

    foreach ($line in Get-Content $secretsFile) {
        if ($line -match '^\s*gemcode_wifi_ssid:\s*"?([^"#]+)') {
            return $matches[1].Trim()
        }
    }

    return $null
}

function Get-CurrentWifiContext {
    $ssid = $null
    $interfaceInfo = netsh wlan show interfaces | Out-String
    foreach ($line in ($interfaceInfo -split "`r?`n")) {
        if ($line -match '^\s*SSID\s*:\s*(.+)$' -and $line -notmatch 'BSSID') {
            $ssid = $matches[1].Trim()
            break
        }
    }

    $ipv4 = Get-NetIPAddress -InterfaceAlias 'Wi-Fi' -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -notlike '169.254.*' } |
        Select-Object -First 1

    return [pscustomobject]@{
        SSID = $ssid
        IPAddress = if ($ipv4) { [string]$ipv4.IPAddress } else { $null }
    }
}

function Update-SecretsBridgeHost {
    param([string]$NewHost)

    if (-not (Test-Path $secretsFile)) {
        throw "docs/secrets.yaml non trovato."
    }

    $content = Get-Content $secretsFile -Raw
    $updated = [regex]::Replace(
        $content,
        '(?m)^\s*gemcode_bridge_host:\s*"?[^"]+"?\s*$',
        "gemcode_bridge_host: `"$NewHost`""
    )

    if ($updated -eq $content) {
        throw "Impossibile aggiornare gemcode_bridge_host in docs/secrets.yaml."
    }

    Set-Content -Path $secretsFile -Value $updated -Encoding UTF8
}

function Get-FirstAvailableSerialPort {
    $ports = [System.IO.Ports.SerialPort]::GetPortNames() | Sort-Object
    return $ports | Select-Object -First 1
}

function Invoke-FirmwareRefresh {
    param([string]$PortName)

    Write-Step "Aggiorno il firmware PTT sul dispositivo ($PortName)"
    Push-Location $repoRoot
    try {
        & esphome run docs/gemcode_box3_ptt.yaml --device $PortName --no-logs
        if ($LASTEXITCODE -ne 0) {
            throw "esphome run ha restituito exit code $LASTEXITCODE"
        }
    } finally {
        Pop-Location
    }
}

function Convert-ChatUrlToBaseUrl {
    param([string]$ChatUrl)

    if ([string]::IsNullOrWhiteSpace($ChatUrl)) {
        return "http://localhost:11434"
    }

    $trimmed = $ChatUrl.TrimEnd('/')
    if ($trimmed.EndsWith('/api/chat')) {
        return $trimmed.Substring(0, $trimmed.Length - '/api/chat'.Length)
    }

    return $trimmed
}

function Get-ConfiguredBackendBaseUrl {
    if ($BackendBaseUrl) {
        return $BackendBaseUrl.TrimEnd('/')
    }

    if (Test-Path $settingsFile) {
        try {
            $json = Get-Content $settingsFile -Raw | ConvertFrom-Json
            if ($json.agent_url) {
                return (Convert-ChatUrlToBaseUrl -ChatUrl ([string]$json.agent_url))
            }
        } catch {
            Write-Info "Impossibile leggere scripts/gemcode_voice_bridge_settings.json, uso default localhost:11434."
        }
    }

    return "http://localhost:11434"
}

function Start-Bridge {
    param([string]$ExpectedPublicHost)

    if (Test-HttpEndpoint -Url "$BridgeUrl/health") {
        Write-Info "Bridge gia attivo su $BridgeUrl."
        $health = Get-Json -Url "$BridgeUrl/api/bridge/health"
        if ($ExpectedPublicHost -and $health.public_host -ne $ExpectedPublicHost) {
            Write-Info "Bridge attivo con public_host diverso ($($health.public_host) -> $ExpectedPublicHost), provo il riavvio automatico."
            return Restart-Bridge -ExpectedPublicHost $ExpectedPublicHost
        }
        return $health
    }

    if (Test-TcpPortInUse -Port 10301) {
        throw "La porta 10301 e occupata ma il bridge non risponde su $BridgeUrl/health."
    }

    $shell = if (Test-CommandAvailable -Name "pwsh") { "pwsh" } else { "powershell" }
    $pythonExe = Get-RepoPythonExecutable
    $bridgeStdOut = Join-Path $logRoot "bridge.stdout.log"
    $bridgeStdErr = Join-Path $logRoot "bridge.stderr.log"
    $publicHostAssignment = if ($ExpectedPublicHost) { "`$env:GEMCODE_BRIDGE_HOST='$ExpectedPublicHost'; " } else { "" }
    $command = "& { Set-Location '$repoRoot'; ${publicHostAssignment}& '$pythonExe' 'scripts/gemcode_voice_bridge.py' }"

    Write-Info "Bridge avviato con Python: $pythonExe"

    Start-Process -FilePath $shell `
        -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $command) `
        -WindowStyle Minimized `
        -RedirectStandardOutput $bridgeStdOut `
        -RedirectStandardError $bridgeStdErr | Out-Null

    Wait-Until -TimeoutSec 60 -Description "bridge HTTP" -Condition {
        Test-HttpEndpoint -Url "$BridgeUrl/health" -TimeoutSec 2
    }

    return Get-Json -Url "$BridgeUrl/api/bridge/health"
}

function Restart-Bridge {
    param([string]$ExpectedPublicHost)

    $processId = Get-ListeningProcessId -Port 10301
    if (-not $processId) {
        throw "Impossibile determinare il processo che occupa la porta 10301."
    }

    $commandLine = Get-ProcessCommandLine -ProcessId $processId
    if ($commandLine -notmatch 'gemcode_voice_bridge\.py') {
        throw "La porta 10301 e occupata da un processo diverso dal bridge GemCode (PID $processId)."
    }

    Write-Info "Riavvio bridge GemCode esistente (PID $processId)."
    Stop-Process -Id $processId -Force

    Wait-Until -TimeoutSec 15 -Description "rilascio porta bridge 10301" -Condition {
        -not (Test-TcpPortInUse -Port 10301)
    }

    return Start-Bridge -ExpectedPublicHost $ExpectedPublicHost
}

function Ensure-BridgeSettings {
    param([string]$DesiredBackendBaseUrl)

    $current = Get-Json -Url "$BridgeUrl/api/settings"
    $patch = @{}
    $desiredChatUrl = "$($DesiredBackendBaseUrl.TrimEnd('/'))/api/chat"
    $hasTtsProvider = $current.PSObject.Properties.Name -contains 'tts_provider'
    $currentTtsProvider = if ($hasTtsProvider) { [string]$current.tts_provider } else { '' }
    $currentTtsVoice = if ($current.PSObject.Properties.Name -contains 'tts_voice') { [string]$current.tts_voice } else { '' }

    if ($current.agent_url -ne $desiredChatUrl) {
        $patch.agent_url = $desiredChatUrl
    }

    if (-not $hasTtsProvider) {
        $patch.tts_provider = 'edge-tts'
    }

    $targetTtsProvider = if ($patch.ContainsKey('tts_provider')) { [string]$patch.tts_provider } else { $currentTtsProvider }

    if ($currentTtsProvider -eq 'windows-sapi' -and $currentTtsVoice -eq 'Microsoft Elsa Desktop') {
        $patch.tts_provider = 'edge-tts'
        $patch.tts_voice = 'it-IT-ElsaNeural'
    } elseif (($targetTtsProvider -eq 'edge-tts') -and (-not $currentTtsVoice -or $currentTtsVoice -like 'Microsoft *')) {
        $patch.tts_voice = 'it-IT-ElsaNeural'
    }

    if ($patch.Count -gt 0) {
        Write-Info "Aggiorno la configurazione bridge per il profilo locale."
        Invoke-RestMethod -Uri "$BridgeUrl/api/settings" -Method Post -ContentType 'application/json' -Body ($patch | ConvertTo-Json) -TimeoutSec 5 | Out-Null
    }

    return Get-Json -Url "$BridgeUrl/api/settings"
}

function Start-WebPortal {
    param([int]$RequestedPort)

    $siteUrl = "http://127.0.0.1:$RequestedPort"
    if (Test-HttpEndpoint -Url $siteUrl -ContentMatch '/src/main.tsx') {
        Write-Info "Portale gia attivo su $siteUrl."
        return $siteUrl
    }

    $port = $RequestedPort
    if (Test-TcpPortInUse -Port $port) {
        $port = Get-FreeTcpPort -StartPort ($RequestedPort + 1)
        $siteUrl = "http://127.0.0.1:$port"
    }

    if (-not (Test-Path (Join-Path $repoRoot 'node_modules'))) {
        Write-Step "node_modules assente, eseguo npm install"
        Push-Location $repoRoot
        try {
            & npm install
            if ($LASTEXITCODE -ne 0) {
                throw "npm install ha restituito exit code $LASTEXITCODE"
            }
        } finally {
            Pop-Location
        }
    }

    $webStdOut = Join-Path $logRoot "web.stdout.log"
    $webStdErr = Join-Path $logRoot "web.stderr.log"
    $command = "/c npm run dev -- --host 127.0.0.1 --port $port --strictPort"

    Start-Process -FilePath "cmd.exe" `
        -ArgumentList $command `
        -WorkingDirectory $repoRoot `
        -WindowStyle Minimized `
        -RedirectStandardOutput $webStdOut `
        -RedirectStandardError $webStdErr | Out-Null

    Wait-Until -TimeoutSec 60 -Description "portale web" -Condition {
        Test-HttpEndpoint -Url $siteUrl -TimeoutSec 2 -ContentMatch '/src/main.tsx'
    }

    return $siteUrl
}

Write-Step "Controllo prerequisiti"
foreach ($commandName in @('python', 'npm', 'esphome')) {
    if (-not (Test-CommandAvailable -Name $commandName)) {
        throw "Comando richiesto non trovato: $commandName"
    }
}

$configuredWifiSsid = Get-WifiSsidFromSecrets
$wifiContext = Get-CurrentWifiContext
$expectedPublicHost = Get-BridgeHostFromSecrets
$backendBase = Get-ConfiguredBackendBaseUrl
$firmwareRefreshRequired = $false

if ($configuredWifiSsid -and $wifiContext.SSID -eq $configuredWifiSsid -and $wifiContext.IPAddress) {
    if ($expectedPublicHost -ne $wifiContext.IPAddress) {
        Write-Step "Sincronizzo il bridge host con l'IP Wi-Fi corrente"
        Write-Info "docs/secrets.yaml: $expectedPublicHost -> $($wifiContext.IPAddress)"
        Update-SecretsBridgeHost -NewHost $wifiContext.IPAddress
        $expectedPublicHost = $wifiContext.IPAddress
        $firmwareRefreshRequired = $true
    }
}

if ($firmwareRefreshRequired) {
    $serialPort = Get-FirstAvailableSerialPort
    if ($serialPort -and -not $NoAutoFlash) {
        Invoke-FirmwareRefresh -PortName $serialPort
    } elseif ($NoAutoFlash) {
        Write-Info "Bridge host aggiornato localmente, ma il reflashing automatico e stato disattivato. Il box restera offline finche non riflashi il firmware PTT."
    } else {
        Write-Info "Bridge host aggiornato localmente, ma non ho trovato una porta seriale disponibile per il reflashing automatico."
    }
}

if (-not $SkipBackendCheck) {
    Write-Step "Verifico backend LLM su $backendBase"
    if (-not (Test-HttpEndpoint -Url "$backendBase/api/tags" -TimeoutSec 4)) {
        throw "Backend LLM non raggiungibile su $backendBase/api/tags. Avvia prima il backend locale compatibile Ollama oppure rilancia con -BackendBaseUrl corretto."
    }
    Write-Info "Backend LLM online."
} else {
    Write-Step "Controllo backend saltato su richiesta"
}

Write-Step "Avvio o riuso il bridge voce"
$bridgeHealth = Start-Bridge -ExpectedPublicHost $expectedPublicHost
$bridgeTtsProvider = 'n/d'
if ($bridgeHealth.PSObject.Properties.Name -contains 'config' -and $bridgeHealth.config -and ($bridgeHealth.config.PSObject.Properties.Name -contains 'tts_provider')) {
    $bridgeTtsProvider = [string]$bridgeHealth.config.tts_provider
}
Write-Info "Bridge online. public_host=$($bridgeHealth.public_host) tts_provider=$bridgeTtsProvider"

Write-Step "Allineo configurazione bridge"
$bridgeSettings = Ensure-BridgeSettings -DesiredBackendBaseUrl $backendBase
Write-Info "Bridge agent_url=$($bridgeSettings.agent_url)"
if ($bridgeSettings.PSObject.Properties.Name -contains 'tts_provider' -and $bridgeSettings.tts_provider) {
    Write-Info "Bridge tts_provider=$($bridgeSettings.tts_provider) voice=$($bridgeSettings.tts_voice)"
}

if ($isWindowsHost) {
    $hasFinalProvider = $bridgeSettings.PSObject.Properties.Name -contains 'tts_provider'
    if (-not $hasFinalProvider) {
        Write-Step "Bridge obsoleto rilevato, provo a riavviarlo"
        $bridgeHealth = Restart-Bridge -ExpectedPublicHost $expectedPublicHost
        $bridgeSettings = Ensure-BridgeSettings -DesiredBackendBaseUrl $backendBase

        $hasFinalProvider = $bridgeSettings.PSObject.Properties.Name -contains 'tts_provider'
        if (-not $hasFinalProvider) {
            throw "Il bridge attivo non espone ancora la configurazione TTS aggiornata anche dopo il riavvio automatico."
        }

        Write-Info "Bridge aggiornato dopo riavvio automatico."
    }
}

Write-Step "Avvio o riuso il portale web"
$siteUrl = Start-WebPortal -RequestedPort $PreferredSitePort
Write-Info "Portale online su $siteUrl"

Write-Step "Verifica finale"
if (-not (Test-HttpEndpoint -Url "$BridgeUrl/health" -TimeoutSec 2)) {
    throw "Bridge non raggiungibile al check finale."
}
if (-not (Test-HttpEndpoint -Url $siteUrl -TimeoutSec 2 -ContentMatch '/src/main.tsx')) {
    throw "Portale non raggiungibile al check finale."
}
if (-not $SkipBackendCheck -and -not (Test-HttpEndpoint -Url "$backendBase/api/tags" -TimeoutSec 2)) {
    throw "Backend non raggiungibile al check finale."
}

Write-Host "" 
Write-Host "GemCode pronto." -ForegroundColor Green
Write-Host "Backend : $backendBase" -ForegroundColor Green
Write-Host "Bridge  : $BridgeUrl" -ForegroundColor Green
Write-Host "LAN host: $expectedPublicHost" -ForegroundColor Green
Write-Host "Portale : $siteUrl" -ForegroundColor Green
Write-Host "Log     : $logRoot" -ForegroundColor Green

if (-not $NoOpenBrowser) {
    Start-Process $siteUrl | Out-Null
}