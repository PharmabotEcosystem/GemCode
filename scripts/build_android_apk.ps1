$ErrorActionPreference = "Stop"

Write-Host "=============================================="
Write-Host "      COMPILAZIONE GEMCODE ANDROID AGENT      "
Write-Host "=============================================="

# 1. Setup Java 17 Locale
$localJdkDir = "scripts\jdk17"
$javaPath = "$localJdkDir\bin\java.exe"
if (-not (Test-Path $javaPath)) {
    $javaPath = "$localJdkDir\java.exe"
}

if (-not (Test-Path $javaPath)) {
    Write-Host "Scaricamento di Java 17 (Eclipse Temurin) necessario per la build Android..."
    if (-not (Test-Path "scripts")) { New-Item -ItemType Directory -Path "scripts" | Out-Null }
    
    $zipPath = "scripts\jdk17.zip"
    if (-not (Test-Path $zipPath)) {
        Invoke-WebRequest -Uri 'https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse' -OutFile $zipPath
    }
    
    Write-Host "Estrazione di Java 17..."
    Expand-Archive -Path $zipPath -DestinationPath "scripts\jdk17_temp" -Force
    $extractedDir = Get-ChildItem "scripts\jdk17_temp" | Select-Object -First 1
    Move-Item -Path "$($extractedDir.FullName)\*" -Destination "scripts\jdk17" -Force
    Remove-Item "scripts\jdk17_temp" -Recurse -Force
    Remove-Item $zipPath -Force
}

$env:JAVA_HOME = (Resolve-Path $localJdkDir).Path
Write-Host "JAVA_HOME impostato su: $($env:JAVA_HOME)"

# 2. Crea la cartella di output
$distDir = "dist\android"
if (-not (Test-Path $distDir)) {
    New-Item -ItemType Directory -Path $distDir | Out-Null
}

# 3. Compila l'APK
Write-Host "`nAvvio compilazione Gradle (assembleDebug)..."
$gradleCmd = ".\gradlew.bat"
$args = @(":android_agent:assembleDebug", "--no-daemon")

$process = Start-Process -FilePath $gradleCmd -ArgumentList $args -NoNewWindow -Wait -PassThru

if ($process.ExitCode -ne 0) {
    Write-Error "La build e fallita con codice $($process.ExitCode). Controlla l'output sopra."
    exit $process.ExitCode
}

# 4. Trova e sposta l'APK
Write-Host "`nCopia dell'APK completato..."
$apkPath = Get-ChildItem -Path "android_agent\build\outputs\apk\debug" -Filter "*.apk" | Select-Object -First 1

if ($apkPath) {
    $targetPath = "$distDir\GemCode-Agent.apk"
    Copy-Item -Path $apkPath.FullName -Destination $targetPath -Force
    Write-Host "=============================================="
    Write-Host "BUILD COMPLETATA CON SUCCESSO!"
    Write-Host "File APK disponibile in: $targetPath"
    Write-Host "=============================================="
} else {
    Write-Error "Build apparentemente riuscita ma nessun APK trovato nella cartella di output!"
}
