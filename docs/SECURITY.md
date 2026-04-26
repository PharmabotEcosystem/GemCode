# 🛡️ GemCode Security Guidelines

GemCode è progettato per essere una piattaforma AI **locale e sicura**. Segui queste linee guida per proteggere i tuoi dati e le tue chiavi API.

## 1. Gestione delle Chiavi API
*   **Non committare mai il file `.env`**: Il repository è configurato per ignorare `.env` tramite `.gitignore`. Utilizza `.env.example` come modello.
*   **Rotazione delle chiavi**: Se sospetti che la tua `GEMINI_API_KEY` sia stata esposta, liberala immediatamente su [Google AI Studio](https://aistudio.google.com/app/apikey) e generane una nuova.
*   **Permessi ristretti**: Ove possibile, limita le capacità delle chiavi API ai soli servizi necessari.

## 2. Esecuzione Locale
*   **Backend Ollama**: Mantieni Ollama aggiornato. Non esporre la porta `11434` su internet senza un reverse proxy sicuro o VPN.
*   **Bridge Voce**: Il bridge comunica sulla rete locale (LAN). Assicurati che il tuo firewall permetta il traffico sulle porte `10300-10311` solo dai dispositivi autorizzati.
*   **Shizuku (Android)**: L'uso di Shizuku permette all'agente di controllare lo smartphone. Concedi i permessi solo se ti fidi dell'integrità del tuo ambiente di sviluppo.

## 3. Privacy dei Dati
*   **Chat History**: La cronologia delle chat è salvata localmente nel browser (LocalStorage) o nel database Room dell'app Android. Nessun dato viene inviato a server GemCode esterni.
*   **Audio/Voice**: La trascrizione (STT) e la sintesi (TTS) avvengono localmente (Whisper/SAPI) o tramite server Edge (Edge-TTS). Se la privacy totale è richiesta, prediligi Windows SAPI come provider TTS.

## 4. Audit del Codice
*   **Script di sistema**: Prima di eseguire nuovi script in `scripts/`, leggine il contenuto per capire quali permessi richiedono.
*   **Dipendenze**: Esegui periodicamente `npm audit` per verificare vulnerabilità nelle librerie Node.js.
