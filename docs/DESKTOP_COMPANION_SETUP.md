# GemCode Desktop Companion Setup

## Cosa aggiunge

Il companion desktop introduce due finestre Windows separate:

- `Studio`: configurazione completa e chat live
- `Widget`: avatar trasparente, always-on-top, click-through opzionale

## Requisiti

- Node.js installato
- bridge GemCode attivo su `http://localhost:10301`
- backend LLM raggiungibile dal bridge o direttamente da GemCode

## Installazione

```bash
npm install
```

## Avvio

```bash
npm run desktop:companion
```

## Cosa puo fare oggi

- chat da tastiera
- registrazione microfono dal desktop con conversione WAV locale
- trascrizione tramite `faster-whisper` nel bridge GemCode
- risposta GemCode via endpoint companion del bridge
- TTS tramite provider del bridge
- widget desktop trasparente con stato `idle/listening/thinking/speaking/error`
- personalizzazione avatar tramite layer immagine locali
- scansione di una cartella radice su `D:` con rilevamento automatico dei personaggi nelle sottocartelle
- rendering diretto nel widget di modelli `obj`, `glb`, `gltf` e tentativo base su `vrm`
- controllo di system prompt, modello, voce, dimensioni, opacita e click-through

## Avatar consigliato

Per ottenere la resa migliore, prepara PNG o WebP trasparenti con questi layer opzionali:

- `baseImage`: il corpo o ritratto principale
- `blinkImage`: occhi chiusi o variante blink
- `mouthOpenImage`: bocca aperta o layer lip-sync
- `auraImage`: alone, glow o effetti secondari

Con un bundle realistico preparato bene, il widget puo avvicinarsi molto a un desktop companion fotorealistico 2.5D senza dipendere da VaM.

## Uso dei personaggi gia presenti su D:

Nel pannello Studio puoi:

- scegliere una cartella radice, ad esempio `D:\\`, `D:\\Custom`, `D:\\Avatar3D` o un archivio dedicato
- lanciare una scansione delle sottocartelle
- applicare con un click i bundle rilevati che hanno almeno una immagine base compatibile

Compatibilita reale:

- cartelle con PNG/WebP/JPG gia esportati: utilizzabili subito
- bundle con layer `base`, `blink`, `mouth`, `aura`: resa migliore
- file 3D tipo `.obj`, `.glb`, `.gltf`: il widget prova a renderizzarli direttamente con scena trasparente
- file `.vrm`: vengono trattati come glTF compatibili; il caricamento dipende da quanto il file resta compatibile con `GLTFLoader`
- file `.fbx`: rilevati nella libreria, ma non ancora renderizzati nel widget attuale
- pacchetti VaM `.var` o personaggi non esportati: non diventano automaticamente compatibili con il widget 2D; per quelli serve una pipeline di export o un renderer dedicato

## Limiti attuali

- il lip-sync e attualmente stato-driven, non ancora fonema-driven
- il renderer ora supporta sia modalita 2D layered sia una prima modalita 3D runtime leggera, ma non e ancora un runtime completo stile Unity/VaM
- la massima resa finale richiedera un renderer dedicato Unity o equivalente