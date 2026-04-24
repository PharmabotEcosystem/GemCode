# ============================================================
# setup_android_sdk.ps1
# Scarica JDK 17 (Temurin) e Android command-line tools,
# installa platforms;android-35 e build-tools;35.0.0,
# aggiorna local.properties con i percorsi corretti.
# ============================================================

$ErrorActionPreference = "Stop"

$SDK_DIR    = "C:\android-sdk"
$JDK_DIR    = "C:\android-jdk"
$TOOLS_ZIP  = "$env:TEMP\cmdline-tools.zip"
$JDK_ZIP    = "$env:TEMP\jdk17.zip"

Write-Host "[1/6] Creazione directory SDK: $SDK_DIR" -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $SDK_DIR | Out-Null
New-Item -ItemType Directory -Force -Path "$SDK_DIR\cmdline-tools" | Out-Null

# ── Download Android Command-Line Tools ────────────────────
Write-Host "[2/6] Download Android command-line tools..." -ForegroundColor Cyan
$CMDLINE_URL = "https://dl.google.com/android/repository/commandlinetools-win-13114758_latest.zip"
Invoke-WebRequest -Uri $CMDLINE_URL -OutFile $TOOLS_ZIP -UseBasicParsing
Write-Host "      Completato: $TOOLS_ZIP"

# ── Estrai e rinomina in latest (struttura richiesta da sdkmanager) ──
Write-Host "[3/6] Estrazione command-line tools..." -ForegroundColor Cyan
Expand-Archive -Path $TOOLS_ZIP -DestinationPath "$SDK_DIR\cmdline-tools" -Force
# Il zip crea cmdline-tools/ → sposta in cmdline-tools/latest
$extracted = Get-ChildItem "$SDK_DIR\cmdline-tools" -Directory | Where-Object { $_.Name -ne "latest" } | Select-Object -First 1
if ($extracted) {
    if (Test-Path "$SDK_DIR\cmdline-tools\latest") {
        Remove-Item "$SDK_DIR\cmdline-tools\latest" -Recurse -Force
    }
    Rename-Item -Path $extracted.FullName -NewName "latest"
}
$SDKMANAGER = "$SDK_DIR\cmdline-tools\latest\bin\sdkmanager.bat"
Write-Host "      sdkmanager: $SDKMANAGER"

# ── Accetta licenze e installa packages ────────────────────
Write-Host "[4/6] Installazione Android SDK packages (android-35, build-tools 35.0.0)..." -ForegroundColor Cyan
$env:JAVA_HOME = "C:\Program Files\Java\jdk-26.0.1"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"

# Accetta tutte le licenze
"y`n" * 10 | & $SDKMANAGER --sdk_root=$SDK_DIR --licenses

# Installa le piattaforme necessarie
& $SDKMANAGER --sdk_root=$SDK_DIR "platforms;android-35" "build-tools;35.0.0" "platform-tools"

Write-Host "      Installazione completata."

# ── Aggiorna local.properties ─────────────────────────────
Write-Host "[5/6] Aggiornamento local.properties..." -ForegroundColor Cyan
$LP_PATH = Join-Path (Split-Path $PSScriptRoot) "local.properties"
$sdkDirEscaped = $SDK_DIR.Replace("\", "\\")
Set-Content -Path $LP_PATH -Value "sdk.dir=$sdkDirEscaped" -Encoding UTF8
Write-Host "      local.properties aggiornato: sdk.dir=$SDK_DIR"

# ── Download JDK 17 (Temurin) ─────────────────────────────
Write-Host "[6/6] Download JDK 17 (Eclipse Temurin)..." -ForegroundColor Cyan
$JDK17_URL = "https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.12%2B7/OpenJDK17U-jdk_x64_windows_hotspot_17.0.12_7.zip"
Invoke-WebRequest -Uri $JDK17_URL -OutFile $JDK_ZIP -UseBasicParsing
Write-Host "      Estrazione JDK 17..."
Expand-Archive -Path $JDK_ZIP -DestinationPath "C:\android-jdk-temp" -Force
$jdk17extracted = Get-ChildItem "C:\android-jdk-temp" -Directory | Where-Object { $_.Name -like "jdk-17*" } | Select-Object -First 1
if ($jdk17extracted) {
    if (Test-Path "$JDK_DIR") { Remove-Item "$JDK_DIR" -Recurse -Force }
    Rename-Item -Path $jdk17extracted.FullName -NewName $JDK_DIR
}
Write-Host "      JDK 17 installato in: $JDK_DIR"

Write-Host ""
Write-Host "=== SETUP COMPLETATO ===" -ForegroundColor Green
Write-Host "SDK_DIR   : $SDK_DIR"
Write-Host "JDK 17    : $JDK_DIR"
Write-Host ""
Write-Host "Per buildare il progetto, esegui:"
Write-Host '  $env:JAVA_HOME = "C:\Program Files\Java\jdk-17"'
Write-Host '  $env:PATH = "$env:JAVA_HOME\bin;$env:PATH"'
Write-Host "  .\gradlew.bat :android_agent:assembleDebug --no-daemon --stacktrace"
