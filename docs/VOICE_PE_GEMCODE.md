# GemCode Voice PE

Questa guida descrive come il dispositivo Home Assistant Voice Preview Edition viene riutilizzato come terminale vocale locale per GemCode, senza dipendere da Home Assistant.

## Obiettivo

Il flusso attuale consente al box di:

- catturare audio dal microfono
- inviarlo al bridge locale via UDP
- trascriverlo con Whisper locale
- interrogare GemCode tramite endpoint `/api/chat` compatibile Ollama
- sintetizzare la risposta con Edge TTS
- scaricare e riprodurre l'audio sul box

## Architettura

```text
Home Assistant Voice PE
  -> UDP control 10311
  -> UDP audio 10310
GemCode voice bridge (Python)
  -> Whisper tiny locale
  -> endpoint GemCode /api/chat
  -> Edge TTS
  -> HTTP 10301 per polling, stato dispositivo e audio
GemCode Web UI
  -> http://localhost:3000
  -> gestisce un profilo LLM condiviso e uno o piu dispositivi via HTTP
```

## File principali

- `scripts/gemcode_voice_bridge.py`
- `scripts/gemcode_voice_bridge_settings.json`
- `docs/gemcode_box3_ptt.yaml`
- `docs/gemcode_box3_wake.yaml`
- `src/App.tsx`

## Segreti locali

I firmware ESPHome leggono i valori sensibili da `docs/secrets.yaml`, che e ignorato da git.

Per inizializzare il file locale:

1. copia `docs/secrets.example.yaml` in `docs/secrets.yaml`
2. imposta SSID e password Wi-Fi
3. imposta `gemcode_bridge_host` con l'IP LAN reale del PC che esegue il bridge
4. imposta `gemcode_api_encryption_key` con la chiave API ESPHome che vuoi usare localmente

## Porte

- HTTP bridge: `10301`
- Wyoming bridge: `10300`
- UDP audio: `10310`
- UDP control: `10311`
- Web UI Vite: `3000`

## Modalita disponibili

### PTT

Firmware: `docs/gemcode_box3_ptt.yaml`

Stato: operativo e gia testato end-to-end.

Uso:

- premi il tasto del box
- il box registra e invia audio al bridge
- il bridge genera risposta e pubblica l'audio via HTTP
- il box scarica l'MP3 e lo riproduce

### Wake word

Firmware: `docs/gemcode_box3_wake.yaml`

Stato: infrastruttura pronta, non ancora completa dal punto di vista acustico.

Nota importante:

- la UI, il bridge e il firmware sono gia predisposti per esporre e gestire la wake word desiderata `GEMMA`
- per un vero trigger vocale `GEMMA` serve ancora un modello `micro_wake_word` dedicato
- senza quel modello, la modalita wake non puo essere considerata una wake word reale di produzione

## Portale unico

Il modello operativo corretto e questo:

- un solo portale web GemCode
- uno o piu dispositivi voce collegati al bridge
- un solo profilo LLM condiviso tra chat web e dispositivi
- stessi parametri base e stesso system prompt per l'uso scelto

Il portale espone un solo profilo centrale e sincronizza quel profilo verso il bridge voce.

Restano separati solo i parametri realmente specifici del canale voce:

- voce TTS
- limiti lunghezza risposta parlata
- metadati wake word

## Bridge settings

Il bridge salva la configurazione in:

- `scripts/gemcode_voice_bridge_settings.json`

Campi principali che il portale puo sincronizzare sul bridge:

- `agent_url`
- `model`
- `system_prompt`
- `temperature`
- `max_response_sentences`
- `max_response_chars`
- `tts_voice`
- `device_id`
- `device_name`
- `device_mode`
- `wake_word_label`
- `wake_word_model`
- `wake_word_notes`

## Stato dispositivo

Il firmware invia heartbeat periodici al bridge con:

- `device_id`
- `device_name`
- modalita firmware (`ptt` o `wake`)
- etichetta wake word
- modello wake word

La Web UI mostra:

- bridge online/offline
- uno o piu dispositivi online/offline
- selezione del device attivo nel portale
- ultimo heartbeat
- ultima trascrizione
- ultima risposta vocale
- eventuale errore del bridge

## Attivazione

### 1. Avvia il backend LLM

Serve un endpoint locale compatibile Ollama su `/api/chat`.

Opzioni tipiche:

- Android Agent GemCode su `http://<ip-android>:8080`
- backend locale su `http://localhost:11434/api/chat`

### 2. Avvia il bridge voce

```bash
python scripts/gemcode_voice_bridge.py
```

Se il box deve raggiungere il bridge via LAN, assicurati che l'host pubblico sia corretto. Il bridge usa per default:

```text
192.168.1.76
```

Puoi forzarlo con:

```powershell
$env:GEMCODE_BRIDGE_HOST="192.168.1.76"
python scripts/gemcode_voice_bridge.py
```

### 3. Avvia il portale web

```bash
npm install
npm run dev
```

Apri:

- `http://localhost:3000/`

### 4. Flash firmware PTT sul box

```bash
esphome run docs/gemcode_box3_ptt.yaml
```

### 5. Verifica dal portale

Nel pannello impostazioni di GemCode controlla:

- host LLM condiviso
- modello condiviso disponibile da `/api/tags`
- system prompt condiviso
- URL del bridge
- lista dispositivi collegati
- device attivo selezionato
- stato bridge online
- stato dispositivo online
- parametri voce specifici

## Flusso di configurazione consigliato

1. Parti con `docs/gemcode_box3_ptt.yaml`.
2. Verifica che il bridge risponda su `http://localhost:10301/health`.
3. Verifica che il box appaia online nella Web UI.
4. Regola host, modello, temperatura e system prompt nella sezione profilo condiviso e applica al bridge.
5. Solo dopo, passa a `docs/gemcode_box3_wake.yaml` se disponi di un modello wake word reale per `GEMMA`.

## Dipendenze bridge

Il bridge usa moduli Python coerenti con gli import del repository:

- `aiohttp`
- `edge-tts`
- `faster-whisper`
- `wyoming`

## Note operative

- Il box operativo oggi e il PTT.
- La chat web e i dispositivi voce devono convergere sullo stesso profilo LLM del portale.
- La Web UI puo sincronizzare il profilo centrale sul bridge senza modificare manualmente il file JSON.
- Se `python scripts/gemcode_voice_bridge.py` fallisce con errore di porta occupata, significa che il bridge e gia in esecuzione o che un altro processo sta usando una delle porte 10300, 10301, 10310 o 10311.
