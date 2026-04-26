# GEMCODE ARCHITECTURE MANIFESTO

Questo documento definisce la struttura ufficiale del progetto GemCode. L'ecosistema è progettato rigorosamente attorno a un **Motore Comune** (Shared Engine) che alimenta **Tre Rami Indipendenti** (Three Pillars). Ogni ramo ha obiettivi separati ma condivide le stesse risorse AI di base.

---

## ⚙️ IL MOTORE COMUNE (Shared AI Engine)
Il motore comune non è un'app a sé stante, ma un set di protocolli e servizi condivisi a cui tutti i rami si collegano.
- **LLM Locale (Ollama Compatible)**: Modelli Gemma 4 in esecuzione sul PC (via LMStudio) o sul telefono (via Android Inference Server). Tutti i rami puntano allo stesso host LLM (es. `http://localhost:11434` o `http://<ip-android>:8080`).
- **STT (Speech-to-Text)**: Motore di trascrizione locale basato su `faster-whisper`.
- **TTS (Text-to-Speech)**: Sintesi vocale tramite `edge-tts` o `Windows SAPI` locale.

---

## 🌿 I TRE RAMI INDIPENDENTI

### 📱 RAMO 1: L'Agente Mobile (Android App)
**Cartella:** `android_agent/`
**Obiettivo:** Agire come entità fisica, sensore nel mondo reale e server di inferenza portatile.
**Indipendenza:** Non sa nulla dell'esistenza di VaM o dell'interfaccia Desktop. Reagisce solo al prompt e al suo ambiente Android.
- **Tecnologia:** Kotlin, Jetpack Compose, MediaPipe/LiteRT.
- **Funzioni:** 
  - Ciclo ReAct autonomo (`AgentLoop.kt`).
  - Esecuzione di Tool fisici (Filesystem, UIInteract, Shizuku).
  - Modalità "Gemma Live" per interazione vocale locale nativa.
  - Esposizione di un server Ollama tramite `InferenceHttpServer.kt`.

### 🌐 RAMO 2: L'Agente di Rete Locale (Orchestratore e UI)
**Cartelle:** `src/` (Web Portal) e `desktop_companion/` (Electron App)
**Obiettivo:** Essere il cervello domestico, la plancia di comando per l'utente e il gestore dei profili.
**Indipendenza:** È il client principale che consuma il Motore Comune. Non si occupa di rendering 3D complesso o di sensori fisici.
- **Tecnologia:** React 19, TypeScript, Vite, Electron (Node.js).
- **Funzioni:**
  - Chat testuale e vocale tramite Web o Widget Desktop.
  - Sincronizzazione del profilo LLM condiviso (System Prompt, Temperatura).
  - Gestione della memoria conversazionale della sessione.

### 🎭 RAMO 3: L'Avatar Semovente (VaM Integration)
**Cartella/File:** `scripts/gemcode_voice_bridge.py` (Modulo VaM Server) e disco `D:\`
**Obiettivo:** Fornire una rappresentazione visiva, fisica e vocale realistica dell'Agente.
**Indipendenza:** Non elabora logiche di ragionamento ReAct. Prende un testo/audio, estrae le emozioni e anima il corpo 3D.
- **Tecnologia:** Python (aiohttp, asyncio), Virt-A-Mate (VaM), Plugin C# (AICompanion.cs, MacGruber Life).
- **Funzioni:**
  - Parsing real-time delle risposte LLM per estrarre `[emozioni]` e `{azioni}`.
  - Trasmissione dei comandi di movimento e del flusso audio generato dal TTS direttamente a VaM (porta 21844).
  - Scansione e caricamento di `.var` (personaggi, abiti, morph) per gestire l'aspetto estetico in modo programmatico.

---

## 🚀 Regole di Sviluppo (Formulazione del Codice)
Per mantenere questa architettura "ben formulata", ogni futuro sviluppo deve rispettare questi vincoli:
1. **Nessun accavallamento:** Il Ramo 1 (Android) non deve contenere codice per gestire avatar 3D. Il Ramo 3 (VaM) non deve gestire prompt utente complessi, ma solo ricevere direttive di recitazione.
2. **API Standard:** Tutti i rami devono comunicare tra loro usando standard aperti (API REST Ollama-compatibili, UDP Wyoming, WebSocket).
3. **Decoupling del Voice Bridge:** Attualmente `gemcode_voice_bridge.py` gestisce sia il Ramo 2 (connettendo hardware IoT domestico) sia il Ramo 3 (VaM). Per una formulazione ancora più pulita in futuro, il server VaM (`AICompanion`) e il server Home Assistant (`Wyoming`) dovrebbero essere considerati moduli logici separati all'interno degli script Python.