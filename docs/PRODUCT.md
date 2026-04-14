# GemCode â€” Product Documentation

## Overview

GemCode is a dual-stack AI platform that combines a **Gemini-powered web chat interface** with a **production-grade autonomous Android agent** that runs local Gemma 4/3 models entirely on-device â€” zero cloud cost, zero data leakage by default.

**Vision: a local Claude Code equivalent for Android + Desktop** â€” a unified AI coding assistant and device controller that uses Gemma 4/3 locally, requires no external API fees, and gives the user full control of their device (files, shell, UI, apps, sensors) when permission is granted. Like Claude Code, it can edit files, run commands, read images and documents, interface with third-party tools via MCP, and orchestrate complex multi-step tasks through a ReAct reasoning loop.

---

## Components

### 1. Android Autonomous Agent

A self-contained AI agent that reasons, plans, and executes actions on an Android device using a local large language model.

**Key capabilities:**
- On-device LLM inference (Gemma 4 E2B / E4B via LiteRT-LM, Gemma 3 1B via MediaPipe) â€” zero mandatory cloud dependency
- Multi-step ReAct loop: think â†’ act â†’ observe â†’ repeat (up to 5 iterations per request)
- Persistent memory with vector similarity search (Room + cosine similarity)
- Foreground service with OOM-resistant process priority
- MVI state machine for deterministic UI/state synchronization
- Local Ollama-compatible HTTP server for browser/desktop access
- `Gemma Live` in-app voice mode with animated live UI, Android microphone capture, speech-to-text handoff to Gemma, and spoken reply playback via Android TTS

**Gemma Live runtime model:**
- Scope: Android-only conversational layer for speaking to Gemma directly from the phone UI
- Input: `SpeechRecognizer` from the device OS
- Inference: existing Gemma request pipeline through `AgentViewModel.sendPrompt()`
- Output: Android `TextToSpeech`
- UX: push-to-speak, then think, then speak response with animated waveform background

**Security and privacy notes for Gemma Live:**
- The Gemma request/response path stays inside the existing app inference path.
- Microphone access is gated by explicit runtime permission.
- The feature does not add root, hidden IPC, or background recording.
- STT/TTS privacy characteristics depend on the Android speech services installed on the device; they are not guaranteed to be fully offline on every phone.
- The microphone session is user-initiated from the Live screen and can be interrupted explicitly.

**Tool ecosystem (post-fix):**

| Tool | Capability |
|------|-----------|
| `FileSystemTool` | read, write, append, list (directory), delete |
| `ShellTool` | âœ¨ **NEW** â€” any ADB-level shell command via Shizuku (am, pm, dumpsys, input, getprop, etc.) |
| `SettingsTool` | Toggle system settings (Wi-Fi, brightness, etc.) via Shizuku |
| `UIInteractTool` | click, scroll, type, dump UI tree via AccessibilityService |
| `SkillTool` | Save and replay reusable named action sequences |
| `GoogleIntegrationTool` | Send email, create Calendar events via Android intents |
| `MCPTool` | Call any Model Context Protocol JSON-RPC server |

### 2. Web Frontend

A Gemini-inspired React/TypeScript chat UI backed by the Gemini API with streaming support.

---

## Code Health â€” Current Analysis (April 2026)

### Bugs Fixed in This Session

| Bug | Impact | Fix Applied |
|-----|--------|-------------|
| `FileSystemTool`, `SettingsTool`, and `MCPTool` declared `execute(params: JsonElement)` instead of `execute(params: JsonObject)` | **Compile error** â€” classes did not implement the `Tool` interface | Changed parameter type to `JsonObject`; removed `.jsonObject` extension calls |
| `SettingsTool`: read stdout then stderr only after `process.waitFor()` | **Deadlock** if either stream buffer fills before process exits | Now drains both streams in parallel via `coroutineScope + async(Dispatchers.IO)` before calling `waitFor()` |
| `FileSystemTool`: only `read` and `write` actions | Agent couldn't list directories, delete files, or append content | Added `list`, `delete`, `append` actions |

### Known Limitations (Roadmap)

| Area | Current State | Target |
|------|--------------|--------|
| Embedding model | `DummyEmbeddingModel` returns constant vectors â€” vector search is not semantic | Replace with TFLite MiniLM-L6-v2 (384 dim) for real semantic search |
| Image/vision | No image reading, OCR, or description capability | Add `ImageTool` wrapping MediaPipe Image Segmentation / Gemini vision fallback |
| Streaming tokens | `LiteRtLmInference.generateResponse()` returns only on completion â€” no partial token stream | Implement streaming callback in `LiteRtLmInference` for live output in UI |
| Desktop app | Only Android â€” no desktop (Windows/macOS/Linux) app | Compose Desktop multiplatform or companion desktop app (see roadmap below) |
| Plugin hot-loading | Only compile-time tools via Hilt multibinding | Dynamic classloader-based plugin system for hot-loaded `.jar` tools |
| Code diff/patch tool | Agent can read/write but cannot apply unified diffs | Add `EditTool` with search-and-replace + unified diff application |
| Screenshot/OCR | No screenshot capture | Add `ScreenshotTool` wrapping MediaProjection API (requires confirmation) |
| Web search | Agent has no way to search the web without MCP | Add `WebSearchTool` using a local MCP server or direct HTTP |

---

## Android Agent Architecture

### ReAct Loop (`AgentLoop.kt`)

```
User Prompt
    â”‚
    â–¼
[1] RAG retrieval (vector search on past memories)
    â”‚
    â–¼
[2] Build system prompt (Constitution + device status + tool manifest + RAG context)
    â”‚
    â–¼
[3] LLM inference â†’ response
    â”‚
    â”œâ”€ JSON tool call detected?
    â”‚       â”‚
    â”‚       â–¼
    â”‚   [4] SafetyGuard.evaluate()
    â”‚       â”œâ”€ Blocked      â†’ observation = block reason
    â”‚       â”œâ”€ Confirmation â†’ suspend, await user ConfirmAction/DenyAction
    â”‚       â””â”€ Safe         â†’ execute tool â†’ observation
    â”‚       â”‚
    â”‚       â–¼
    â”‚   Append observation to history â†’ next iteration (max 5)
    â”‚
    â””â”€ No tool call â†’ final answer â†’ persist to memory â†’ return
```

### MVI State Machine

All agent state flows through a single `StateFlow<AgentState>`, updated exclusively by `AgentOrchestrator`. Intents are serialized through a `Channel<AgentIntent>` to eliminate race conditions.

```
Uninitialized â”€â”€InitializeModelâ”€â”€â–º LoadingWeights â”€â”€successâ”€â”€â–º Idle
                                                   â”€â”€failureâ”€â”€â–º CriticalError

Idle â”€â”€UserPromptâ”€â”€â–º Reasoning â”€â”€tool callâ”€â”€â–º ExecutingTool â”€â”€resultâ”€â”€â–º Reasoning
                               â”€â”€final answerâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–º Idle
                               â”€â”€exceptionâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–º CriticalError

ExecutingTool / Reasoning â”€â”€SafetyGuardâ”€â”€â–º AwaitingConfirmation
                                           â”€â”€ConfirmActionâ”€â”€â–º Reasoning (continues)
                                           â”€â”€DenyActionâ”€â”€â”€â”€â–º Reasoning ("cancelled")
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
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  Layer 1: CONSTITUTION (const val â€” compile-time literal) â”‚
â”‚  Immutable. Cannot be overridden by user input or prefs.  â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚  Layer 2: Device Status (injected at runtime)             â”‚
â”‚  Battery %, RAM, charging state, Shizuku availability     â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚  Layer 3: Tool Manifest (from ToolRegistry)               â”‚
â”‚  Name, description, JSON schema for each available tool   â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚  Layer 4: RAG Context (vector similarity from memory DB)  â”‚
â”‚  Most relevant past interactions for the current query    â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

**Constitution rules (selected):**

| Rule | Description |
|------|-------------|
| 2.1 | Zero hallucinations â€” state uncertainty explicitly |
| 3.3 | Safety catch â€” MANDATORY pause before destructive operations |
| 3.4 | No privilege escalation â€” never attempt root, `su`, ptrace |
| 4.1 | Critical battery (â‰¤5%) â€” refuse all inference |
| 4.3 | Low RAM â€” refuse if free memory < 1536 MB |
| 6.1 | Offline-first â€” prefer on-device operations |

### SafetyGuard

Intercepts every tool call before execution. Returns one of three verdicts:

- **Blocked** â€” execution denied, reason returned as ReAct observation  
  Patterns: `su`/root commands, Magisk/SuperSU, ptrace/`/proc/<pid>/mem`, SELinux manipulation, factory reset, ADB TCP port exposure

- **RequiresConfirmation** â€” loop suspends until user explicitly approves  
  Patterns: `rm -rf` outside temp directories, `pm uninstall`, disabling Wi-Fi/mobile data, network policy reset, remounting `/system` as read-write, enabling ADB/developer settings

- **Safe** â€” execution proceeds immediately

### Dependency Injection (Hilt)

All infrastructure singletons are provided via `AgentModule` and `ToolsModule`. Adding a new tool requires only one `@Provides @IntoSet` binding â€” zero changes to `AgentLoop`.

```
ApplicationContext
  â”œâ”€â”€ AppDatabase (Room, WAL mode)
  â”œâ”€â”€ EmbeddingModelWrapper (DummyEmbeddingModel â€” replace with MiniLM-L6 in prod)
  â”œâ”€â”€ LocalMemoryManager â†’ DB + EmbeddingModel
  â”œâ”€â”€ ShizukuCommandExecutor (@Inject constructor)
  â”œâ”€â”€ DeviceStatusProvider â†’ Context + ShizukuExecutor
  â”œâ”€â”€ MutableLlmInferenceWrapper (lazy-swappable; starts as UninitializedLlmInference)
  â”œâ”€â”€ ContextPruningManager (maxTokens=8192, threshold=75%, keepLast=4 turns)
  â”œâ”€â”€ SafetyGuard (@Inject constructor)
  â”œâ”€â”€ SystemPromptBuilder â†’ DeviceStatusProvider + ToolRegistry
  â”œâ”€â”€ ToolRegistry â†’ Set<Tool> (ConcurrentHashMap, O(1) lookup)
  â””â”€â”€ AgentLoop â†’ all of the above
```

### Memory System (`LocalMemoryManager.kt`)

- **Long-term memory** (`memories` table): past interaction embeddings, retrieved via cosine similarity
- **Session memory** (`conversation_state` table): current conversation history string
- **Context pruning** (`ContextPruningManager`): when history exceeds 75% of the 8192-token context window, older turns are summarized using the same on-device Gemma model; last 4 turns are always kept verbatim

### Model Loading â€” mmap Safety

Model weights are **never** loaded as a `ByteArray`. `LiteRtLmInference` calls `initialize()` on an `Engine` configured with `modelPath`, which triggers native `mmap()` via LiteRT's JNI layer. The OS manages page eviction under memory pressure without copying weights into the JVM heap.

```
ResourceManager constants:
  MIN_FREE_RAM_MB  = 1536 MB  (hard floor â€” inference rejected below this)
  WARN_FREE_RAM_MB = 2048 MB  (soft warning logged)
  INFERENCE_OVERHEAD_MB = 512 MB  (added to model footprint for load check)
```

---

## Tool Ecosystem

| Tool | Transport | Description |
|------|-----------|-------------|
| `FileSystemTool` | Direct FS | Read, write, append, list, delete files/dirs. Requires `MANAGE_EXTERNAL_STORAGE`. |
| `ShellTool` | Shizuku IPC | **Any** ADB-level shell command (am, pm, dumpsys, input, getprop, etc.). |
| `SettingsTool` | Shizuku IPC | Toggle named system settings (Wi-Fi, Bluetooth, brightness, etc.) via `settings put`. |
| `UIInteractTool` | AccessibilityService | Tap, swipe, type text, find elements by resource ID, dump UI tree. |
| `SkillTool` | `SkillManager` | Save and replay reusable named action sequences. |
| `GoogleIntegrationTool` | Android Intents | Send email, create calendar events, read contacts via standard Android intents. |
| `MCPTool` | HTTP (OkHttp) | Call any Model Context Protocol JSON-RPC 2.0 server endpoint. |

### Shizuku IPC Bridge

`ShizukuCommandExecutor` runs ADB-level shell commands (UID 2000) without root via `Shizuku.newProcess()`. Stdout and stderr are drained in two parallel `async(Dispatchers.IO)` coroutines inside a `channelFlow{}` to prevent deadlock. `process.waitFor()` is called only after both streams have closed.

```kotlin
sealed interface CommandOutput {
    data class Stdout(val line: String)  : CommandOutput
    data class Stderr(val line: String)  : CommandOutput
    data class ExitCode(val code: Int)   : CommandOutput
}
```

---

## Supported Models

| Model | Engine | Format | Min RAM | Source |
|-------|--------|--------|---------|--------|
| Gemma 4 E2B IT (CPU/GPU) | LiteRT-LM 0.10.0 | `.litertlm` | ~4 GB | HuggingFace `litert-community` |
| Gemma 4 E4B IT (CPU/GPU) | LiteRT-LM 0.10.0 | `.litertlm` | ~6 GB | HuggingFace `litert-community` |
| Gemma 3 1B IT (CPU/GPU) | MediaPipe 0.10.22 | `.task` | ~2 GB | `storage.googleapis.com` |
| Gemma 2B IT (CPU/GPU) | MediaPipe 0.10.22 | `.bin` | ~1.8â€“2.4 GB | `storage.googleapis.com` |

Models are downloaded in-app without authentication. The `createInferenceEngine()` factory selects `LiteRtLmInference` for `.litertlm` files and `MediaPipeLlmInference` for `.task`/`.bin` files automatically.

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

The web frontend can also **connect to the Android device as a local inference backend** via `InferenceHttpServer` â€” set the `OLLAMA_HOST` or equivalent to the device's IP:8080 to route completion requests through Gemma instead of the Gemini API.

---

## Roadmap â€” Claude Code-like Desktop Experience

The vision is an app and service that, like Claude Code, can:

- Perform **massive coding tasks** autonomously (read, write, refactor, test code files)
- **Control the device** and its resources (filesystem, shell, running processes, UI)
- Interface with **MCP servers** and **third-party plugins**
- Read and describe **images, PDFs, and documents**
- Generate and edit documents/images
- Work with full user-granted freedom on any app or file

### Phase 1 â€” Android Agent Stabilisation (current, completed)
- [x] ReAct loop with Gemma 4/3 local inference (LiteRT-LM + MediaPipe)
- [x] SafetyGuard + Constitution â€” immutable safety layer
- [x] Hilt DI + MVI state machine + Room memory
- [x] ShellTool â€” general ADB-level shell execution
- [x] FileSystemTool â€” read, write, append, list, delete
- [x] **Fixed:** `Tool.execute(JsonObject)` interface mismatch (compile error)
- [x] **Fixed:** SettingsTool deadlock on stdout/stderr stream reading

### Phase 2 â€” Coding & Document Tools
- [ ] `EditTool`: search-and-replace, unified diff/patch application (core for coding tasks)
- [ ] `ImageTool`: read image files â†’ get description via Gemma 4's vision capability
- [ ] `ScreenshotTool`: capture current screen â†’ feed to Gemma vision (requires user confirmation)
- [ ] `DocumentTool`: extract text from PDF, DOCX via Apache PDFBox / Apache POI
- [ ] Real TFLite embedding model (MiniLM-L6-v2, 384 dim) to replace `DummyEmbeddingModel`
- [ ] Streaming token output in UI (partial token callbacks from `LiteRtLmInference`)

### Phase 3 â€” Plugin & MCP Ecosystem
- [ ] MCP server discovery: browse and connect to local/LAN MCP servers automatically
- [ ] Dynamic plugin hot-loading: install tool `.jar` files at runtime via classloader
- [ ] Plugin manifest format (name, version, tool implementations, permissions)
- [ ] Built-in MCP server for exposing the agent's own tools to other apps
- [ ] Support for SSE (Server-Sent Events) MCP transport in addition to HTTP

### Phase 4 â€” Desktop Companion App
The `InferenceHttpServer` already exposes an Ollama-compatible API on port 8080. A desktop app can:
- run directly on Windows/macOS/Linux using the same model via **llama.cpp** or **ONNX Runtime**
- OR connect to the Android device running as an inference server

**Target tech stack for desktop:**
- Kotlin Multiplatform + Compose Desktop (shares 95% of agent logic)
- `LlamaCppEngine` implementing `LlmInferenceWrapper` for the desktop target
- Same `AgentLoop`, `SafetyGuard`, `ContextPruningManager` â€” zero logic duplication
- Desktop tools: `DesktopShellTool` (ProcessBuilder), `DesktopFileSystemTool`, `ClipboardTool`
- System tray integration with persistent agent service

### Phase 5 â€” Full Device Control
- [ ] `ProcessTool`: list running processes, kill by name/PID
- [ ] `ClipboardTool`: read/write clipboard content
- [ ] `NotificationTool`: read active notifications, dismiss or interact
- [ ] `ContactsTool`: read/write contacts via ContentProvider
- [ ] `BrowserTool`: open URLs, read current page title/URL via AccessibilityService
- [ ] Audio transcription: on-device Whisper (Whisper.cpp or ONNX) for voice input

---

## Technology Stack

### Android Agent

| Library | Version | Role |
|---------|---------|------|
| Kotlin | 2.2.x | Primary language |
| Jetpack Compose | BOM 2024.09 | UI |
| Hilt | 2.57.2 | Dependency injection |
| LiteRT-LM | 0.10.0 | On-device Gemma 4 inference (.litertlm) |
| MediaPipe Tasks GenAI | 0.10.22 | Legacy Gemma 2B/3 inference (.bin/.task) |
| Room | 2.7.0 | SQLite persistence (WAL) |
| Shizuku API | 13.1.0 | Privileged ADB bridge |
| Kotlinx Serialization | 1.6.3 | JSON parsing |
| Kotlinx Coroutines | 1.8.1 | Async / concurrency |
| NanoHTTPD | â€” | Local Ollama-compatible HTTP server |

### Web Frontend

| Library | Version | Role |
|---------|---------|------|
| React | 19.0.0 | UI framework |
| TypeScript | 5.8 | Language |
| Vite | 6.2.0 | Build tool |
| Tailwind CSS | 4.1.14 | Styling |
| Motion (Framer) | â€” | Animations |
| `@google/genai` | ^1.29.0 | Gemini API client |
| Express | 4.21.2 | Backend server |

---

## Security & Privacy

- **Offline-first**: all inference runs on-device; no data transmitted without explicit tool call
- **Constitution**: immutable `const val` baked into bytecode; cannot be overridden by SharedPreferences, user input, or runtime configuration
- **SafetyGuard**: pre-execution intercept layer for every tool call â€” blocks root/ptrace/factory-reset patterns unconditionally
- **mmap loading**: model weights never copied into JVM heap; OS manages page lifecycle
- **Foreground Service**: `oom_adj` score ~200 â€” survives memory pressure that would kill background apps
- **Shizuku, not root**: ADB-level privilege (UID 2000) for system settings; root access (`su`) is blocked by SafetyGuard rule 3.4
- **Stream deadlock prevention**: all Shizuku child-process streams are drained in parallel coroutines

---

## System Requirements

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| Android API | 29 (Android 10) | 33+ (Android 13) |
| RAM | 3 GB | 6 GB+ |
| Free RAM at inference | 1536 MB | 2048 MB+ |
| Storage | 2 GB (Gemma 3 1B) | 6 GB+ (Gemma 4 E4B) |
| Shizuku | Optional | Recommended for `SettingsTool` + `ShellTool` |
| Accessibility Service | Optional | Required for `UIInteractTool` |
| `MANAGE_EXTERNAL_STORAGE` | Optional | Required for `FileSystemTool` |

---

## Getting Started

### Android Agent

1. **Build** with Android Studio or `./gradlew assembleDebug`
2. **Install** on Android 10+, â‰¥3 GB RAM
3. **Grant permissions**: Accessibility Service, storage, notification, camera (as needed)
4. **Start Shizuku** (wireless ADB or developer options)
5. **Download a model**: select Gemma variant in settings; app downloads and mmap-loads it
6. **Send a prompt**: type in chat UI or dispatch `com.example.agent.ACTION_SUBMIT_PROMPT` via Tasker/ADB

### Web Frontend

```bash
npm install
cp .env.example .env        # set GEMINI_API_KEY
npm run dev
```

### Connect Web Frontend to Android Inference Server

Set the Ollama host in the frontend settings to `http://<device-ip>:8080`. The `InferenceHttpServer` exposes an Ollama-compatible `/api/chat` endpoint backed by the local Gemma model.

