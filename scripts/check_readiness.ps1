# GemCode Readiness Check
$ErrorActionPreference = "Continue"

Write-Host "`n==> Verifico lo stato di GemCode..." -ForegroundColor Cyan

# 1. Check Ollama
Write-Host "1. Controllo Ollama (Porta 11434)... " -NoNewline
try {
    $ollama = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -ErrorAction Stop
    Write-Host "ONLINE" -ForegroundColor Green
    if ($null -eq $ollama.models -or $ollama.models.Count -eq 0) {
        Write-Host "   [!] AVVISO: Nessun modello trovato in Ollama." -ForegroundColor Yellow
        Write-Host "   Suggerimento: Esegui 'ollama pull gemma2:9b' in un terminale." -ForegroundColor Gray
    } else {
        $names = $ollama.models.name -join ', '
        Write-Host "   [✓] Modelli disponibili: $names" -ForegroundColor Gray
    }
} catch {
    Write-Host "OFFLINE" -ForegroundColor Red
}

# 2. Check Voice Bridge
Write-Host "2. Controllo Voice Bridge (Porta 10301)... " -NoNewline
try {
    $bridge = Invoke-RestMethod -Uri "http://localhost:10301/health" -ErrorAction Stop
    Write-Host "ONLINE" -ForegroundColor Green
    Write-Host "   [✓] Public Host: $($bridge.public_host)" -ForegroundColor Gray
} catch {
    Write-Host "OFFLINE" -ForegroundColor Red
}

# 3. Check Web Portal
Write-Host "3. Controllo Portale Web (Porta 3000)... " -NoNewline
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000" -Method Head -ErrorAction Stop
    Write-Host "ONLINE" -ForegroundColor Green
} catch {
    Write-Host "OFFLINE" -ForegroundColor Red
}

Write-Host "`nSe tutto e' ONLINE, puoi testare il portale qui: http://localhost:3000" -ForegroundColor Cyan
Write-Host ""
