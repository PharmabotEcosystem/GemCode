@echo off
title Avvio GemCode V2 (Integrazione VaM)
color 0A

echo ==========================================================
echo        GEMCODE V2 - STARTUP SYSTEM (STILE ROS_KAI)
echo ==========================================================
echo.
echo Inizializzazione in corso...
echo - Controllando Node.js...
node -v >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo [ERRORE] Node.js non e' installato o non e' nel PATH.
    pause
    exit
)

echo - Avvio del server di sviluppo locale (Vite)...
echo - L'interfaccia si aprira' in automatico nel tuo browser predefinito.
echo.
echo ==========================================================
echo  Assicurati di avviare Virt-A-Mate sul disco D e 
echo  di caricare il plugin VAM-Link sulla porta 21844.
echo ==========================================================
echo.

:: Avvia il browser
start http://localhost:5173

:: Avvia l'ambiente dev
npm run dev

pause
