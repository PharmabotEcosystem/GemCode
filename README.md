# GemCode

GemCode e una piattaforma AI locale con tre blocchi principali:

| Componente | Stack | Descrizione |
| --- | --- | --- |
| Web UI | React 19 + TypeScript + Vite | Portale unico con profilo LLM condiviso, chat browser e gestione multi-device |
| Android Agent | Kotlin + Jetpack Compose | Agente ReAct con endpoint chat Ollama-compatible |
| Voice Bridge + Voice PE | Python + ESPHome | STT, TTS, bridge HTTP/UDP/Wyoming e firmware per Home Assistant Voice PE |

## Avvio rapido

### 1. Portale web

```bash
npm install
npm run dev
```

Portale locale:

- `http://localhost:3000/`
- `http://192.168.1.76:3000/`

### 2. Bridge voce locale

Il bridge usa Whisper, Edge TTS e un endpoint `/api/chat` compatibile Ollama.

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
http://localhost:8080
```

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

## Documentazione

- [docs/PRODUCT.md](docs/PRODUCT.md)
- [docs/VOICE_PE_GEMCODE.md](docs/VOICE_PE_GEMCODE.md)
