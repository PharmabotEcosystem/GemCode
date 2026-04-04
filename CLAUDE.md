# CLAUDE.md — GemCode Repository Guide

## Project Overview

GemCode is a dual-stack AI project combining:
1. **Web Frontend** — A React/TypeScript game UI deployed on Google AI Studio
2. **Android Agent** — An autonomous agent framework for Android with local/remote LLM inference, tool execution, and memory management

---

## Repository Structure

```
GemCode/
├── src/                          # React frontend (TypeScript)
│   ├── App.tsx                   # Main app component (~400 lines) — full game UI
│   ├── main.tsx                  # React entry point
│   └── index.css                 # Custom Tailwind theme (neon dark mode)
├── android_agent/                # Android autonomous agent (Kotlin)
│   ├── build.gradle.kts          # Android build config + dependencies
│   ├── core/                     # Agent reasoning engine
│   │   ├── AgentLoop.kt          # ReAct loop (Reasoning + Acting)
│   │   ├── GeminiApiLlmInference.kt  # Remote Gemini 2.5-flash via HTTP
│   │   └── MediaPipeLlmInference.kt  # Local Gemma model (MediaPipe)
│   ├── tools/                    # Tool implementations
│   │   ├── Tool.kt               # Base interface (name, description, parametersSchema)
│   │   ├── FileSystemTool.kt     # Read/write files
│   │   ├── SettingsTool.kt       # System settings via Shizuku/ADB
│   │   ├── UIInteractTool.kt     # Accessibility-based UI automation
│   │   ├── SkillTool.kt          # Save/load/execute persistent skills
│   │   ├── GoogleIntegrationTool.kt  # Email + Calendar intents
│   │   └── MCPTool.kt            # Model Context Protocol HTTP client
│   ├── memory/
│   │   └── LocalMemoryManager.kt # Room DB + cosine-similarity vector search
│   ├── ui/
│   │   └── ShizukuSetupUI.kt     # Shizuku permission setup UI (Compose)
│   └── src/main/
│       ├── MainActivity.kt       # Main Compose UI (~770 lines)
│       ├── CameraCaptureActivity.kt
│       └── AgentAccessibilityService.kt  # Overlay + gesture dispatch
├── index.html                    # SPA entry point
├── package.json                  # Frontend deps + scripts
├── vite.config.ts                # Vite config (React + Tailwind, env injection)
├── tsconfig.json                 # TypeScript config (ES2022, bundler resolution)
├── .env.example                  # Required env vars: GEMINI_API_KEY, APP_URL
├── metadata.json                 # AI Studio metadata
└── README.md
```

---

## Tech Stack

### Frontend (Web)
| Tool | Version | Purpose |
|------|---------|---------|
| React | 19.0.0 | UI framework |
| TypeScript | 5.8 | Language |
| Vite | 6.2.0 | Build tool / dev server |
| Tailwind CSS | 4.1.14 | Utility-first styling |
| Motion | (framer-motion) | Animations |
| Lucide React | — | Icons |
| @google/genai | ^1.29.0 | Gemini API client |
| Express | 4.21.2 | Backend server |

### Android Agent
| Tool | Version | Purpose |
|------|---------|---------|
| Kotlin | — | Primary language |
| Jetpack Compose | — | UI |
| MediaPipe Tasks GenAI | 0.10.14 | On-device LLM inference (Gemma) |
| Shizuku API | 13.1.0 | Privileged ADB bridge |
| Room | 2.6.1 | Local SQLite storage |
| Kotlinx Serialization | 1.6.3 | JSON parsing |
| Coroutines | 1.8.0 | Async operations |

---

## Development Workflows

### Frontend

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Lint
npm run lint

# Clean build artifacts
npm run clean
```

**Environment setup:** Copy `.env.example` to `.env` and set `GEMINI_API_KEY`.

The Vite config automatically injects `GEMINI_API_KEY` and `APP_URL` from environment. In Google AI Studio, these are provided automatically — HMR is disabled in that environment.

### Android Agent

Build via Android Studio or Gradle:
```bash
./gradlew assembleDebug
./gradlew installDebug
```

**Runtime requirements:**
- Android API 29+ (Android 10+)
- Shizuku service running (for `SettingsTool`)
- `MANAGE_EXTERNAL_STORAGE` permission (for `FileSystemTool`)
- Accessibility service enabled (for `UIInteractTool`)
- Camera permission (for `CameraCaptureActivity`)
- LLM models downloaded at runtime from MediaPipe storage buckets

---

## Key Architecture Patterns

### Android Agent — ReAct Loop (`AgentLoop.kt`)

The agent uses the **ReAct (Reasoning + Acting)** pattern:
1. User message → LLM generates JSON tool call or final answer
2. If tool call: execute tool, append observation to history, repeat
3. If no tool call: return final answer to user
4. Max 5 iterations per request

Tool calls are JSON objects parsed from LLM output. Each tool implements:
```kotlin
interface Tool {
    val name: String
    val description: String
    val parametersSchema: String  // JSON Schema
    suspend fun execute(params: JsonObject): String
}
```

### Dual LLM Support

- **Local** (`MediaPipeLlmInference`): Gemma 2B/9B with int4/int8 quantization, CPU/GPU, memory-mapped model files
- **Remote** (`GeminiApiLlmInference`): Gemini 2.5-flash via HTTP API — used as fallback or when local model is unavailable

### Memory System (`LocalMemoryManager.kt`)

- Room database stores past interactions as embeddings
- Cosine similarity search for relevant memory retrieval
- Two storage areas: `memories` (long-term) + `conversation_state` (session)
- `EmbeddingModelWrapper` interface allows swapping embedding backends

### Frontend UI (`App.tsx`)

- Dark-themed crime/street game interface
- Districts: Cobras, Vipers, Lawless
- Player stats: health, money, reputation
- Tabs: strada (street), inventory, market, crew
- All state managed via React `useState` hooks
- Motion library for tab transition animations

---

## Code Conventions

### TypeScript (Frontend)
- Strict TypeScript — avoid `any`
- Functional React components with hooks
- Tailwind utility classes inline (no separate CSS modules)
- Neon color palette: `#39ff14` (green), `#b026ff` (purple), `#00f3ff` (cyan), `#ff003c` (red)
- `vite.config.ts` has path alias `@` → `./src`

### Kotlin (Android)
- Coroutines for all async operations — prefer `suspend` functions over callbacks
- Kotlinx Serialization for JSON — use `@Serializable` data classes
- Jetpack Compose for all UI — no XML layouts
- `Flow` for streaming data (downloads, model output)
- Tools are stateless where possible; side effects go through `suspend fun execute()`

### General
- No test files exist — this is a prototype/demo project
- Commits follow conventional format (e.g., `feat:`, `fix:`, `refactor:`)

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Google Gemini API key |
| `APP_URL` | No | Deployment URL (auto-set in AI Studio) |

---

## Important Files for AI Assistants

| File | Why it matters |
|------|----------------|
| `src/App.tsx` | Entire frontend UI — read before modifying any UI behavior |
| `android_agent/core/AgentLoop.kt` | Core reasoning engine — changes here affect all agent behavior |
| `android_agent/tools/Tool.kt` | Base interface — all new tools must implement this |
| `android_agent/memory/LocalMemoryManager.kt` | Memory retrieval logic — affects agent context |
| `android_agent/src/main/MainActivity.kt` | Android UI entry point — agent initialization happens here |
| `vite.config.ts` | Build config — check before adding new deps or aliases |
| `.env.example` | Reference for required env vars |

---

## Adding a New Tool (Android)

1. Create `android_agent/tools/MyNewTool.kt` implementing `Tool`
2. Provide a clear `description` (used by LLM for tool selection)
3. Define `parametersSchema` as valid JSON Schema
4. Implement `suspend fun execute(params: JsonObject): String` — return human-readable result
5. Register the tool in `MainActivity.kt` where `AgentLoop` is initialized

## Adding a New Frontend Feature

1. All UI lives in `src/App.tsx` — add state with `useState`, render in the appropriate tab
2. Use existing Tailwind color tokens from `index.css` for consistent theming
3. Wrap animated elements with `<motion.div>` for transitions
4. If calling Gemini API, use `@google/genai` SDK already configured
