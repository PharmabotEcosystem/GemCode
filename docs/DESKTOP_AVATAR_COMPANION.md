# GemCode Desktop Avatar Companion

## Obiettivo

Creare un companion desktop che usi GemCode come cervello AI ma che si presenti come:

- avatar realistico e semovente
- widget senza sfondo sul desktop Windows
- interazione live tramite voce e tastiera
- app separata per configurare prompt di sistema, avatar, voce, dimensioni e comportamento

## Verdetto rapido

Si, e fattibile.

Non e pero fattibile bene come semplice estensione del portale web Vite gia esistente. Il browser puo gestire chat e impostazioni, ma non puo offrire in modo affidabile tutte queste capacita insieme:

- finestra trasparente reale senza cornice
- always-on-top di livello desktop
- click-through selettivo
- trascinamento libero del widget fuori dal browser
- rendering avatar 2D/3D realistico con lip-sync e idle motion di livello alto

Per arrivare al risultato richiesto serve un host desktop nativo o semi-nativo.

## Cosa si puo riusare oggi da GemCode

GemCode ha gia diversi pezzi utili:

- backend LLM compatibile Ollama via Android in [android_agent/service/InferenceHttpServer.kt](android_agent/service/InferenceHttpServer.kt)
- bridge voce locale con STT/TTS/settings/device state in [scripts/gemcode_voice_bridge.py](scripts/gemcode_voice_bridge.py)
- UI React gia pronta per chat e impostazioni in [src/App.tsx](src/App.tsx)
- quickstart Windows e profilo centrale gia documentati in [README.md](README.md)
- roadmap desktop gia abbozzata in [docs/PRODUCT.md](docs/PRODUCT.md)

Questo significa che il cervello conversazionale e gran parte della pipeline voce ci sono gia. Quello che manca e il layer desktop-avatar.

## Cosa insegna JUNO

Dal manuale di JUNO emergono tre blocchi separati:

1. bridge logico locale
2. motore avatar/rendering separato
3. pannello di controllo web

Questo schema e corretto anche per GemCode. Il punto forte di JUNO non e il pannello web in se, ma l'avere separato il cervello dall'engine grafico che rende possibile overlay trasparente, animazioni e click-through.

## Opzioni architetturali

### Opzione A: adattatore GemCode sopra stack JUNO o VaM

Idea:

- mantenere l'engine avatar attuale di JUNO o VaM
- sostituire il bridge AI con un adapter che chiama GemCode
- usare GemCode per prompt, memoria, voce e logica conversazionale

Vantaggi:

- massimo realismo subito se l'avatar JUNO e gia pronto
- overlay trasparente e comportamento desktop gia concettualmente risolti

Svantaggi:

- dipendenza forte da VaM e dal plugin C#
- packaging fragile
- forte accoppiamento a uno stack non nato per essere una desktop app generica
- piu difficile distribuire e manutenere

Conclusione:

buona strada per un prototipo privato o una prova di concetto, non e la base migliore per un prodotto GemCode pulito e pushabile a lungo termine.

### Opzione B: Companion desktop nativo con renderer avatar dedicato

Idea:

- GemCode resta il cervello
- una app desktop dedicata rende l'avatar come widget trasparente
- una seconda app o pannello gestisce chat, prompt, voce, avatar e dimensioni

Vantaggi:

- architettura pulita
- controllo totale su finestra trasparente, click-through, hotkey, audio e tray
- separazione netta tra configurazione e presenza visiva sul desktop

Svantaggi:

- richiede costruire un renderer/avatar layer che oggi non esiste nel repo

Conclusione:

e la direzione consigliata.

### Opzione C: sola app Electron con avatar web

Idea:

- impacchettare la UI attuale in Electron
- aggiungere una finestra trasparente e un avatar 2D o WebGL

Vantaggi:

- velocita di prototipazione alta
- riuso massimo di React e del portale esistente

Svantaggi:

- realismo limitato rispetto a Unity o VaM
- piu difficile ottenere un avatar davvero fotorealistico e semovente
- il lip-sync e le animazioni avanzate diventano presto il collo di bottiglia

Conclusione:

ottimo per il primo MVP se si accetta un avatar meno realistico del target finale.

## Raccomandazione pratica

La soluzione piu sensata e una architettura a due applicazioni Windows:

1. GemCode Companion Widget
2. GemCode Companion Studio

### 1. GemCode Companion Widget

Responsabilita:

- mostra l'avatar senza sfondo
- always-on-top
- click-through opzionale
- trascinamento e resize
- idle animation, sguardo, respirazione, piccoli movimenti
- lip-sync durante il TTS
- indicatori visivi per listening, thinking, speaking, error

### 2. GemCode Companion Studio

Responsabilita:

- chat da tastiera
- push-to-talk o live voice
- editing system prompt e persona
- selezione avatar
- selezione voce
- gestione dimensioni, posizione e comportamento del widget
- scelta del backend GemCode: locale PC, Android via LAN, bridge voce locale

## Stack consigliato

### MVP rapido

- Electron o Tauri per la finestra desktop e il pannello Studio
- React per la UI dello Studio
- finestra overlay separata trasparente
- avatar 2D o Live2D-like
- bridge attuale di GemCode come backend voce

Questo permette di arrivare in fretta a:

- chat tastiera
- push-to-talk
- finestra trasparente
- voce locale
- controllo prompt, voce, dimensioni e avatar

### Versione piu forte e realistica

- Unity standalone come renderer avatar
- Electron o Tauri per Studio e settings
- comunicazione locale via WebSocket o HTTP locale
- modelli avatar VRM o equivalente

Questo e il miglior compromesso tra realismo, controllo desktop e mantenibilita.

### Versione sperimentale massima qualita visiva

- riuso di VaM o del runtime JUNO come renderer esterno
- GemCode come cervello tramite adapter HTTP

Questa via ha senso solo se il tuo obiettivo prioritario e mantenere proprio quel look realistico gia esistente di Juno.

## Gap tecnici attuali di GemCode

Per supportare davvero un companion avatar live servono almeno questi pezzi nuovi.

### 1. Event stream realtime

Il bridge attuale espone stato e polling HTTP, ma non un canale realtime per eventi ricchi. Per l'avatar serve un feed con eventi tipo:

- listening_started
- partial_transcript
- final_transcript
- thinking_started
- response_chunk
- tts_started
- tts_finished
- emotion_changed
- avatar_action

Qui la prima modifica utile e aggiungere WebSocket o SSE in [scripts/gemcode_voice_bridge.py](scripts/gemcode_voice_bridge.py).

### 2. Desktop voice pipeline dedicata

Per il desktop widget serve decidere il percorso voce.

Opzione migliore per privacy locale:

- STT locale con Whisper o faster-whisper
- TTS locale con Windows SAPI o Piper
- GemCode come orchestratore centrale

### 3. Avatar state model

Serve un piccolo contratto dati condiviso tra cervello e renderer:

- idle
- listening
- thinking
- speaking
- error
- emotion
- mouth_open o viseme stream
- look_target
- gesture preset

### 4. Config store unificato

Oggi il bridge salva gia alcune impostazioni. Il companion richiede anche:

- system prompt desktop
- profilo companion
- avatar selezionato
- scala del widget
- posizione X/Y
- opacity e click-through
- device audio input/output
- hotkey globali

### 5. Rendering avatar

Questo pezzo oggi manca del tutto nel repo.

## Architettura target consigliata

```text
GemCode Companion Studio
  -> chat tastiera
  -> settings prompt/avatar/voice/size
  -> controlli live

GemCode Local Brain
  -> /api/chat compatibile Ollama
  -> STT/TTS locale
  -> memoria e profilo
  -> stream eventi realtime

GemCode Companion Widget
  -> finestra trasparente
  -> avatar renderer
  -> idle motion / lip-sync / states
```

## Come integrare davvero JUNO con GemCode

Se vuoi sfruttare direttamente il concetto di JUNO, il modo giusto non e inglobare JUNO nel portale GemCode. Il modo giusto e creare un adapter:

- il pannello o il plugin di JUNO continua a parlare con un bridge locale
- quel bridge inoltra richieste a GemCode su `/api/chat`
- le impostazioni principali vengono lette da una configurazione GemCode
- il bridge traduce la risposta GemCode in:
  - testo chat
  - TTS
  - eventuali tag emozione o gesto per l'avatar

Quindi l'integrazione corretta e per composizione, non per fusione diretta del codice.

## Piano consigliato in 4 fasi

### Fase 1: MVP desktop funzionante

- impacchettare uno Studio desktop
- aggiungere overlay trasparente semplice
- riusare il bridge GemCode per chat e voce
- supportare tastiera e push-to-talk
- salvare prompt, voce, avatar e size

### Fase 2: realtime serio

- aggiungere WebSocket o SSE al bridge
- inviare stati live all'overlay
- sincronizzare lip-sync e stato conversazionale

### Fase 3: avatar realistico

- passare a renderer Unity o integrare un runtime avatar dedicato
- aggiungere idle motion, gaze, blink, breathing, gesture presets

### Fase 4: modalita Juno-grade

- emotion extraction
- gesture orchestration
- multi-avatar profiles
- eventuale supporto a renderer esterni come VaM

## Decisione finale

La possibilita tecnica c'e ed e concreta.

La strategia corretta per GemCode e questa:

- non provare a far diventare il portale web il widget avatar finale
- usare GemCode come cervello e configuratore centrale
- creare un widget desktop nativo dedicato per l'avatar
- tenere aperta una integrazione adapter con JUNO o VaM solo come ramo sperimentale ad alta resa visiva

## Next step consigliato

Se vuoi procedere davvero, il primo deliverable sensato e:

- specifica tecnica del protocollo realtime tra GemCode e widget avatar
- scelta dello stack desktop tra Electron MVP e Unity production
- scaffolding iniziale di `desktop_companion/` nel repo