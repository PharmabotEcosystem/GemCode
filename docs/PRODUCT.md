# GemCode — Product Documentation

## Overview

GemCode is a dual-stack AI platform that combines a **Gemini-powered web chat interface** with a **production-grade autonomous Android agent**. The Android agent runs a full ReAct (Reasoning and Acting) loop entirely on-device using Google's Gemma 4 LLM via LiteRT-LM, with no mandatory cloud dependency. The web frontend is a TypeScript/React chat application with streaming, settings panel, and conversation history.

---

## Components

### 1. Android Autonomous Agent

A self-contained AI agent that reasons, plans, and executes actions on an Android device using a local large language model.

**Key capabilities:**
- On-device LLM inference (Gemma 4 E2B / E4B via LiteRT-LM) — zero data leaves the device by default
- Multi-step ReAct loop: think → act → observe → repeat (up to 5 iterations per request)
- Persistent memory with vector similarity search (Room + cosine similarity)
- Tool execution: filesystem, system settings, UI automation, Google Calendar/Mail, MCP servers
- Privileged ADB-level shell access via Shizuku (no root required)
- Immutable safety constitution baked into the system prompt at compile time
- Foreground service with OOM-resistant process priority
- MVI state machine for deterministic UI/state synchronization

### 2. Web Frontend

A Gemini-inspired React/TypeScript chat UI backed by the Gemini API with streaming support.

---

## Android Agent Architecture

### ReAct Loop (`AgentLoop.kt`)

```
User Prompt
    │
    ▼
[1] RAG retrieval (vector search on past memories)
    │
    ▼
[2] Build system prompt (Constitution + device status + tool manifest + RAG context)
    │
    ▼
[3] LLM inference → response
    │
    ├─ JSON tool call detected?
    │       │
    │       ▼
    │   [4] SafetyGuard.evaluate()
    │       ├─ Blocked      → observation = block reason
    │       ├─ Confirmation → suspend, await user ConfirmAction/DenyAction
    │       └─ Safe         → execute tool → observation
    │       │
    │       ▼
    │   Append observation to history → next iteration (max 5)
    │
    └─ No tool call → final answer → persist to memory → return
```

### MVI State Machine

All agent state flows through a single `StateFlow<AgentState>`, updated exclusively by `AgentOrchestrator`. Intents are serialized through a `Channel<AgentIntent>` to eliminate race conditions.

```
Uninitialized ──InitializeModel──► LoadingWeights ──success──► Idle
                                                   ──failure──► CriticalError

Idle ──UserPrompt──► Reasoning ──tool call──► ExecutingTool ──result──► Reasoning
                               ──final answer──────────────────────────► Idle
                               ──exception──────────────────────────────► CriticalError

ExecutingTool / Reasoning ──SafetyGuard──► AwaitingConfirmation
                                           ──ConfirmAction──► Reasoning (continues)
                                           ──DenyAction────► Reasoning ("cancelled")
```

**States:**

| State | Description |
|-------|-------------|
| `Uninitialized` | App just launched; no model loaded |
| `LoadingWeights` | mmap-ing model file from disk |
| `Idle` | Ready to accept prompts |
| `Reasoning` | LLM generating next token |
| `ExecutingTool` | Tool running (filesystem, shell, etc.) |
| `AwaitingConfirmation` | SafetyGuard halted execution; UI shows confirmation dialog |
| `CriticalError` | Unrecoverable error; requires user action to retry |

### System Prompt Architecture

The system prompt has four layers assembled at each inference call:

```
┌─────────────────────────────────────────────────────────┐
│  Layer 1: CONSTITUTION (const val — compile-time literal) │
│  Immutable. Cannot be overridden by user input or prefs.  │
├─────────────────────────────────────────────────────────┤
│  Layer 2: Device Status (injected at runtime)             │
│  Battery %, RAM, charging state, Shizuku availability     │
├─────────────────────────────────────────────────────────┤
│  Layer 3: Tool Manifest (from ToolRegistry)               │
│  Name, description, JSON schema for each available tool   │
├─────────────────────────────────────────────────────────┤
│  Layer 4: RAG Context (vector similarity from memory DB)  │
│  Most relevant past interactions for the current query    │
└─────────────────────────────────────────────────────────┘
```

**Constitution rules (selected):**

| Rule | Description |
|------|-------------|
| 2.1 | Zero hallucinations — state uncertainty explicitly |
| 3.3 | Safety catch — MANDATORY pause before destructive operations |
| 3.4 | No privilege escalation — never attempt root, `su`, ptrace |
| 4.1 | Critical battery (≤5%) — refuse all inference |
| 4.3 | Low RAM — refuse if free memory < 1536 MB |
| 6.1 | Offline-first — prefer on-device operations |

### SafetyGuard

Intercepts every tool call before execution. Returns one of three verdicts:

- **Blocked** — execution denied, reason returned as ReAct observation  
  Patterns: `su`/root commands, Magisk/SuperSU, ptrace/`/proc/<pid>/mem`, SELinux manipulation, factory reset, ADB TCP port exposure

- **RequiresConfirmation** — loop suspends until user explicitly approves  
  Patterns: `rm -rf` outside temp directories, `pm uninstall`, disabling Wi-Fi/mobile data, network policy reset, remounting `/system` as read-write, enabling ADB/developer settings

- **Safe** — execution proceeds immediately

### Dependency Injection (Hilt)

All infrastructure singletons are provided via `AgentModule` and `ToolsModule`. Adding a new tool requires only one `@Provides @IntoSet` binding — zero changes to `AgentLoop`.

```
ApplicationContext
  ├── AppDatabase (Room, WAL mode)
  ├── EmbeddingModelWrapper (pluggable — DummyEmbeddingModel by default)
  ├── LocalMemoryManager → DB + EmbeddingModel
  ├── ShizukuCommandExecutor (@Inject constructor)
  ├── DeviceStatusProvider → Context + ShizukuExecutor
  ├── MutableLlmInferenceWrapper (lazy-swappable; starts as UninitializedLlmInference)
  ├── ContextPruningManager (maxTokens=8192, threshold=75%, keepLast=4 turns)
  ├── SafetyGuard (@Inject constructor)
  ├── SystemPromptBuilder → DeviceStatusProvider + ToolRegistry
  ├── ToolRegistry → Set<Tool> (ConcurrentHashMap, O(1) lookup)
  └── AgentLoop → all of the above
```

### Memory System (`LocalMemoryManager.kt`)

- **Long-term memory** (`memories` table): past interaction embeddings, retrieved via cosine similarity
- **Session memory** (`conversation_state` table): current conversation history string
- **Context pruning** (`ContextPruningManager`): when history exceeds 75% of the 8192-token context window, older turns are summarized using the same on-device Gemma model; last 4 turns are always kept verbatim

### Model Loading — mmap Safety

Model weights are **never** loaded as a `ByteArray`. `MediaPipeLlmInference` calls `setModelPath()`, which triggers native `mmap(MAP_SHARED | MAP_POPULATE)` via LiteRT's JNI layer. The OS manages page eviction under memory pressure without copying weights into the JVM heap.

```
ResourceManager constants:
  MIN_FREE_RAM_MB  = 1536 MB  (hard floor — inference rejected below this)
  WARN_FREE_RAM_MB = 2048 MB  (soft warning logged)
  INFERENCE_OVERHEAD_MB = 512 MB  (added to model footprint for load check)
```

---

## Tool Ecosystem

| Tool | Transport | Description |
|------|-----------|-------------|
| `FileSystemTool` | Direct FS | Read, write, list, delete files. Requires `MANAGE_EXTERNAL_STORAGE`. |
| `SettingsTool` | Shizuku IPC | Toggle system settings (Wi-Fi, Bluetooth, brightness, etc.) via ADB-level shell. |
| `UIInteractTool` | AccessibilityService | Tap, swipe, type text, find elements by content description or resource ID. |
| `SkillTool` | `SkillManager` | Save and replay reusable named action sequences. |
| `GoogleIntegrationTool` | Android Intents | Send email, create calendar events, read contacts via standard Android intents. |
| `MCPTool` | HTTP (OkHttp) | Call any Model Context Protocol server endpoint. |

### Shizuku IPC Bridge

`ShizukuCommandExecutor` runs ADB-level shell commands (UID 2000) without root via `Shizuku.newProcess()`. Stdout and stderr are drained in two parallel `async(Dispatchers.IO)` coroutines inside a `channelFlow{}` to prevent deadlock. `process.waitFor()` is called only after both streams have closed.

```kotlin
// Output types emitted by execute(command): Flow<CommandOutput>
sealed interface CommandOutput {
    data class Stdout(val line: String)  : CommandOutput
    data class Stderr(val line: String)  : CommandOutput
    data class ExitCode(val code: Int)   : CommandOutput
}
```

---

## Supported Models

| Model | Engine | Format | RAM Required | Download |
|-------|--------|--------|-------------|---------|
| Gemma 4 E2B IT (CPU/GPU) | LiteRT-LM 0.10.0 | `.litertlm` | ~4 GB | HuggingFace `litert-community` |
| Gemma 4 E4B IT (CPU/GPU) | LiteRT-LM 0.10.0 | `.litertlm` | ~6 GB | HuggingFace `litert-community` |
| Gemma 3 1B IT (CPU/GPU) | MediaPipe 0.10.22 | `.task` | ~2 GB | `storage.googleapis.com` |
| Gemma 2B IT (CPU/GPU) | MediaPipe 0.10.22 | `.bin` | ~1.8–2.4 GB | `storage.googleapis.com` |

Models are downloaded directly in-app without authentication. The `createInferenceEngine()` factory selects `LiteRtLmInference` for `.litertlm` files and `MediaPipeLlmInference` for `.task`/`.bin` files automatically.

---

## Web Frontend

A React 19 / TypeScript 5.8 chat interface inspired by the Gemini app design.

**Theme:** Gemini-inspired dark mode (`#131314` base, `#8ab4f8` Google Blue accent)

**Features:**
- Streaming chat with `@google/genai` SDK (Gemini 2.5 Flash / 2.0 Flash / 1.5 Flash)
- Collapsible sidebar with conversation history
- Settings panel: model selector, temperature slider, system prompt editor
- Welcome screen with suggestion chips
- Copy button on messages, stop-generation button
- Auto-resizing textarea input (Shift+Enter for newline)

---

## Technology Stack

### Android Agent

| Library | Version | Role |
|---------|---------|------|
| Kotlin | — | Primary language |
| Jetpack Compose | BOM 2024.09.00 | UI |
| Hilt | 2.51.1 | Dependency injection |
| LiteRT-LM | 0.10.0 | On-device Gemma 4 inference (.litertlm) |
| MediaPipe Tasks GenAI | 0.10.22 | Legacy Gemma 2B/3 inference (.bin/.task) |
| Room | 2.6.1 | SQLite persistence (WAL) |
| Shizuku API | 13.1.0 | Privileged ADB bridge |
| Kotlinx Serialization | 1.6.3 | JSON parsing |
| Kotlinx Coroutines | 1.8.0 | Async / concurrency |
| OkHttp | 4.12.0 | HTTP (Gemini API, MCP) |

### Web Frontend

| Library | Version | Role |
|---------|---------|------|
| React | 19.0.0 | UI framework |
| TypeScript | 5.8 | Language |
| Vite | 6.2.0 | Build tool |
| Tailwind CSS | 4.1.14 | Styling |
| Motion (Framer) | — | Animations |
| `@google/genai` | ^1.29.0 | Gemini API client |
| Express | 4.21.2 | Backend server |

---

## Security & Privacy

- **Offline-first**: all inference runs on-device; no data transmitted without explicit tool call
- **Constitution**: immutable `const val` baked into bytecode; cannot be overridden by SharedPreferences, user input, or runtime configuration
- **SafetyGuard**: pre-execution intercept layer for every tool call — blocks root/ptrace/factory-reset patterns unconditionally
- **mmap loading**: model weights never copied into JVM heap; OS manages page lifecycle
- **Foreground Service**: `oom_adj` score ~200 (vs ~900+ for background processes) — survives memory pressure that would kill background apps
- **Shizuku, not root**: ADB-level privilege (UID 2000) for system settings; root access (`su`) is blocked by SafetyGuard constitution rule 3.4

---

## System Requirements

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| Android API | 29 (Android 10) | 33+ (Android 13) |
| RAM | 3 GB | 6 GB+ |
| Free RAM at inference | 1536 MB | 2048 MB+ |
| Storage | 2 GB (model files) | 4 GB+ |
| Shizuku | Optional | Recommended for `SettingsTool` |
| Accessibility Service | Optional | Required for `UIInteractTool` |
| `MANAGE_EXTERNAL_STORAGE` | Optional | Required for `FileSystemTool` |

---

## Getting Started

### Android Agent

1. **Build** the project with Android Studio or `./gradlew assembleDebug`
2. **Install** on a device running Android 10+ with ≥3 GB RAM
3. **Grant permissions**: Accessibility Service, storage, notification, camera (as needed)
4. **Start Shizuku** on the device (via wireless ADB or developer options)
5. **Download a model**: select a Gemma variant in the settings; the app downloads and mmap-loads it via `AgentIntent.InitializeModel`
6. **Send a prompt**: type in the chat UI or dispatch `ACTION_SUBMIT_PROMPT` via Tasker/BroadcastReceiver

### Web Frontend

```bash
# Clone and install
npm install

# Configure environment
cp .env.example .env
# Set GEMINI_API_KEY in .env

# Start dev server
npm run dev

# Production build
npm run build
```

The app is also deployable directly to Google AI Studio (API key and `APP_URL` are injected automatically in that environment).

---

## Foreground Service & External Triggers

The agent runs inside `AgentForegroundService` with `START_STICKY` and `foregroundServiceType="specialUse"`, keeping it alive during long inference sessions.

External systems (Tasker, WorkManager, automation apps) can trigger the agent via:

```
Intent action: com.example.agent.ACTION_SUBMIT_PROMPT
Extra: "prompt" (String) — the message to process
```

The service returns results via `SharedFlow<String>` for same-process consumers, or can be extended to broadcast results.
