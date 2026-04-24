$ErrorActionPreference = "Stop"

Write-Host "=============================================="
Write-Host "      COMPILAZIONE GEMCODE ANDROID AGENT      "
Write-Host "=============================================="

# 1. Trova Java (se JAVA_HOME non è impostato)
if (-not $env:JAVA_HOME) {
    Write-Host "JAVA_HOME non impostato, cerco il JDK di Android Studio..."
    
    $paths = @(
        "C:\Program Files\Android\Android Studio\jbr",
        "C:\Program Files\Android\Android Studio\jre",
        "C:\Program Files\Java\jdk-17*"
    )
    
    $javaFound = $false
    foreach ($p in $paths) {
        $matches = Get-Item -Path $p -ErrorAction SilentlyContinue
        if ($matches -and $matches.Count -gt 0) {
            $env:JAVA_HOME = $matches[0].FullName
            Write-Host "✓ Trovato JDK in: $($env:JAVA_HOME)"
            $javaFound = $true
            break
        }
    }
    
    if (-not $javaFound) {
        Write-Warning "Nessun JDK locale trovato in percorsi standard. Gradle proverà a usare la Toolchain per scaricare Java 17."
    }
} else {
    Write-Host "✓ JAVA_HOME è già impostato: $($env:JAVA_HOME)"
}

# 2. Crea la cartella di output
$distDir = "dist\android"
if (-not (Test-Path $distDir)) {
    New-Item -ItemType Directory -Path $distDir | Out-Null
}

# 3. Compila l'APK
Write-Host "`nAvvio compilazione Gradle (assembleDebug)..."
$gradleCmd = ".\gradlew"
$args = @(":android_agent:assembleDebug", "--no-daemon")

$process = Start-Process -FilePath $gradleCmd -ArgumentList $args -NoNewWindow -Wait -PassThru

if ($process.ExitCode -ne 0) {
    Write-Error "La build è fallita con codice $($process.ExitCode). Controlla l'output sopra."
    exit $process.ExitCode
}

# 4. Trova e sposta l'APK
Write-Host "`nCopia dell'APK completato..."
$apkPath = Get-ChildItem -Path "android_agent\build\outputs\apk\debug" -Filter "*.apk" | Select-Object -First 1

if ($apkPath) {
    $targetPath = "$distDir\GemCode-Agent.apk"
    Copy-Item -Path $apkPath.FullName -Destination $targetPath -Force
    Write-Host "=============================================="
    Write-Host "✓ BUILD COMPLETATA CON SUCCESSO!"
    Write-Host "File APK disponibile in: $targetPath"
    Write-Host "=============================================="
} else {
    Write-Error "Build apparentemente riuscita ma nessun APK trovato nella cartella di output!"
}
