# GemCode

GemCode e una piattaforma AI locale con tre blocchi principali:

| Componente | Stack | Descrizione |
| --- | --- | --- |
| Web UI | React 19 + TypeScript + Vite | Portale unico con profilo LLM condiviso, chat browser e gestione multi-device |
| Android Agent | Kotlin + Jetpack Compose | Agente ReAct con endpoint chat Ollama-compatible |
| Voice Bridge + Voice PE | Python + ESPHome | STT, TTS, bridge HTTP/UDP/Wyoming e firmware per Home Assistant Voice PE |

## Avvio rapido

### 0. Bootstrap automatico Windows

Per avviare in sequenza backend, bridge e portale con health check e apertura automatica del sito quando tutto e pronto:

```powershell
npm run quickstart:pc
```

Lo script:

- verifica `python` e `npm`
- rileva l'IP Wi-Fi corrente del PC sulla rete domestica
- aggiorna automaticamente `docs/secrets.yaml` se l'IP LAN del bridge cambia
- riflasha automaticamente il firmware PTT se il box e collegato via USB e il bridge host e cambiato
- controlla che il backend locale compatibile Ollama risponda su `/api/tags`
- avvia o riusa il bridge voce su `10301`
- riallinea il bridge al backend locale e al TTS offline Windows
- avvia o riusa il portale web
- apre il sito solo dopo i check finali

Parametri utili:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start_gemcode_local.ps1 -BackendBaseUrl http://localhost:11434
powershell -ExecutionPolicy Bypass -File .\scripts\start_gemcode_local.ps1 -NoOpenBrowser
powershell -ExecutionPolicy Bypass -File .\scripts\start_gemcode_local.ps1 -NoAutoFlash
```

### 1. Portale web

```bash
npm install
npm run dev
```

Portale locale:

- `http://localhost:3000/`
- `http://<ip-lan-corrente-del-pc>:3000/`

### 2. Bridge voce locale

Il bridge usa Whisper, `edge-tts` come voce gratuita predefinita, e un endpoint `/api/chat` compatibile Ollama.

Nel portale puoi scegliere tra piu voci TTS. Il default ripristinato e `it-IT-ElsaNeural`, cioe la voce gratuita che funzionava meglio. Windows SAPI resta disponibile come fallback locale.

```bash
python scripts/gemcode_voice_bridge.py
```

Porte usate dal bridge:

- HTTP: `10301`
- Wyoming: `10300`
- UDP audio: `10310`
- UDP controllo: `10311`

File di configurazione persistente del bridge:

- `scripts/gemcode_voice_bridge_settings.json`

### 3. Backend LLM condiviso

Il portale usa un solo backend LLM compatibile Ollama per tutti i canali.

Default portale:

```text
http://localhost:11434
```

Se invece vuoi usare l'Android Agent come backend Ollama-compatible, imposta esplicitamente il suo host alternativo, tipicamente `http://<ip-android>:8080`.

Dal portale scegli:

- host LLM unico
- modello unico tra quelli esposti da `/api/tags`
- temperatura unica
- system prompt unico

Con `Applica a tutti`, lo stesso profilo viene sincronizzato anche sul bridge voce e quindi sui dispositivi collegati.

### 4. Android Agent

```bash
./gradlew assembleDebug
./gradlew installDebug
```

Requisiti runtime: Android 10+ (API 29), >= 4 GB RAM, Shizuku opzionale.

Funzioni principali lato app Android:

- controllo dello smartphone tramite tool locali e permessi Android
- chat testuale con modelli Gemma locali o backend compatibili Ollama
- nuova modalita `Gemma Live` con microfono, trascrizione vocale Android, risposta Gemma e lettura TTS locale del telefono

Note operative per `Gemma Live`:

- richiede il permesso microfono nell'app
- usa `SpeechRecognizer` e `TextToSpeech` del dispositivo Android
- e una prima versione push-to-speak: ascolta, invia il testo a Gemma, poi legge la risposta
- non e ancora una sessione continua full duplex come Gemini Live
- la privacy dipende dal motore voce disponibile sul telefono: il flusso Gemma resta locale, ma STT/TTS sono quelli offerti da Android

## Voice PE

Firmware principali:

- `docs/gemcode_box3_ptt.yaml`: firmware stabile push-to-talk
- `docs/gemcode_box3_wake.yaml`: firmware preparato per wake word

Per compilare o flashare i firmware senza committare credenziali, crea `docs/secrets.yaml` partendo da `docs/secrets.example.yaml` e inserisci SSID, password Wi-Fi, host LAN del bridge e chiave API ESPHome locale.

Il firmware PTT e gia pronto per l'uso operativo con heartbeat verso il bridge. Il firmware wake e pronto lato infrastruttura, ma per una vera attivazione vocale con `GEMMA` serve ancora un modello `micro_wake_word` dedicato.

## Modello operativo

GemCode va usato come sistema centrale unico:

- un solo portale web
- uno o piu dispositivi registrati sul bridge
- un solo profilo LLM condiviso
- parametri e system prompt coerenti per tutti i canali

Nel portale restano separati solo i parametri realmente specifici del canale voce, come TTS, limiti risposta e wake word.

Separazione dei ruoli:

- app Android: controllo smartphone e interfaccia locale `Gemma Live`
- portale web: controllo PC, file locali del browser, orchestrazione desktop e bridge
- dispositivo vocale esterno: dialoga con il portale/bridge del PC, non con l'app Android

## Documentazione

- [docs/PRODUCT.md](docs/PRODUCT.md)
- [docs/VOICE_PE_GEMCODE.md](docs/VOICE_PE_GEMCODE.md)
- [docs/DESKTOP_AVATAR_COMPANION.md](docs/DESKTOP_AVATAR_COMPANION.md)
- [docs/DESKTOP_COMPANION_SETUP.md](docs/DESKTOP_COMPANION_SETUP.md)
