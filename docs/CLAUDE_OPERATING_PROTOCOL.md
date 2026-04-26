# CLAUDE OPERATING PROTOCOL & SKILLS - GEMCODE PROJECT

Questo documento definisce il set di competenze (Skills), le linee guida operative e la mappa di intervento che Claude utilizzerà per la manutenzione, l'estensione e il testing del progetto **GemCode**.

## 🧠 1. Skill: Android Agent Engineering (Kotlin)
**Dominio:** `android_agent/src/main/java/com/example/agent/`
- **ReAct Loop (`AgentLoop.kt`):** Competenze nella manipolazione del ciclo di ragionamento. Claude è istruito per gestire in modo sicuro il parsing JSON delle chiamate ai Tool e per iniettare logiche di RAG via `LocalMemoryManager`.
- **Inference Server (`InferenceHttpServer.kt`):** Modifica del server NanoHTTPD per estendere la compatibilità API Ollama (es. aggiunta di supporto per stream o nuovi endpoint di embedding).
- **Integrazione Tool:** Creazione di nuovi tool ereditando da `Tool.kt`, manipolando i permessi Android (Shizuku, Accessibility, Filesystem) nel pieno rispetto della `SafetyGuard`.

## 🐍 2. Skill: Voice & VaM Orchestration (Python)
**Dominio:** `scripts/gemcode_voice_bridge.py`
- **Networking Asincrono (`aiohttp` / `asyncio`):** Estensione degli endpoint HTTP e gestione dello stream audio UDP (Wyoming protocol) per Home Assistant senza introdurre latenza (blocking code).
- **Virt-A-Mate Integration:** Mantenimento della compatibilità con i plugin VaM (`AICompanion.cs`). Aggiornamento del parser RegEx `_parse_emotion_and_actions` per supportare nuove animazioni o logiche di lip-sync.
- **Parsing Nativo:** Lettura e de-compressione on-the-fly dei file `.var` di VaM per mappare i contenuti e renderli disponibili alla UI.

## ⚛️ 3. Skill: React Web UI (TypeScript)
**Dominio:** `src/App.tsx` e componenti Vite
- **State Management:** Gestione dello stato in tempo reale per sincronizzare l'output dell'LLM (Ollama stream) con le chiamate WebSocket/HTTP verso VaM (`vam.triggerEmotion`).
- **UI/UX:** Mantenimento dello stile "Ros_KAI" e del tema dark-neon gamificato tramite Tailwind CSS.

## 🤖 4. Skill: LLM & Prompt Engineering
- **Gestione Multi-Modello:** Configurazione di system prompt ottimizzati in base al motore in uso (Gemma 2B locale via MediaPipe vs. Gemini 2.5 flash remoto).
- **Formattazione ReAct:** Mantenimento della precisione dell'LLM nell'estrarre il JSON per i tool e separare l'azione dall'osservazione e dalla risposta vocale (TTS).

---

### 🗺️ Protocollo di Intervento di Claude

1. **Analisi Preventiva:** Prima di ogni modifica, Claude leggerà le interfacce per assicurarsi di non rompere il contratto tra Android (Server), Python (Bridge) e React (Client).
2. **Local-First Policy:** Claude privilegerà sempre soluzioni che mantengono i dati e l'inferenza all'interno della rete locale.
3. **Controllo Sicurezza:** Qualsiasi nuovo tool Android che richiede accessi Shizuku o filesystem verrà sottoposto a rigidi log di sicurezza.
4. **Validazione VaM:** Le modifiche al parser delle risposte LLM dovranno sempre garantire che i tag (es. `[smile]`) vengano estratti e NON inviati al TTS (per evitare che la voce li legga ad alta voce).