# 🤖 GemCode Android Agent

This is the core mobile component of the GemCode ecosystem. It implements a state-of-the-art **ReAct (Reasoning + Acting)** autonomous agent that runs entirely locally on Android devices.

## 🌟 Key Components

### 🧠 Inference Engine (LiteRT-LM)
The agent uses the Google **LiteRT-LM** (formerly MediaPipe LLM Inference) to run quantized LLMs like **Gemma 4**.
- **Path**: `core/LiteRtLmInference.kt`
- **Features**: GPU/NPU acceleration, dynamic sampling parameters (Temp, Top-K, Top-P).

### 🎙️ Live Mode (Voice Interaction)
Enables hands-free "Walkie-Talkie" usage.
- **Components**: `GemmaLiveManager.kt`, `SpeechRecognizer`, `TextToSpeech`.
- **Logic**: Automatically converts voice to text, streams to Gemma, and reads back responses.

### 🛠️ Skill System (Automation)
The agent is not just a chatbot; it's an operator.
- **SkillManager**: Manages persistent instructions for complex tasks.
- **Built-in Skills**: Battery reports, WiFi management, screenshots, volume control, app listing.
- **SkillTool**: Injects skill instructions into the agent's reasoning loop.

### 🏛️ Architecture (MVI)
We use a strict **Model-View-Intent (MVI)** pattern for predictable state management.
- **Intent**: `mvi/AgentIntent.kt` (UserPrompt, InitializeModel, CancelInference).
- **State**: `mvi/AgentState.kt` (Reasoning, ExecutingTool, AwaitingConfirmation).
- **Orchestrator**: `orchestrator/AgentOrchestrator.kt` (The central brain handling transitions).

---

## 🚀 Getting Started

### Prerequisites
1.  **Shizuku**: Must be installed and active for system automation features.
2.  **SDK**: Android API 31+ (Android 12) is recommended.

### Setup
1.  **Model Download**: Use the built-in model selector to download a `.litertlm` model from Hugging Face.
2.  **Permissions**: Grant Record Audio and Accessibility permissions when prompted.
3.  **Optimization**: Go to the **Tune** panel (Settings icon) and ensure "GPU Acceleration" is enabled if your device supports it.

## 📂 Directory Map
- `core/`: Low-level wrappers for LLM, STT, TTS, and Device Status.
- `di/`: Hilt Dependency Injection modules.
- `memory/`: Room database for conversation history and RAG (Vector Search).
- `shizuku/`: Shell command execution via Shizuku binder.
- `tools/`: The agent's "hands" (ShellTool, FileSystemTool, CanvasTool).

---

## 🔒 Safety First
All potentially destructive actions (like `rm -rf` or disabling system settings) are intercepted by the **SafetyGuard**. The agent will stop and ask for your explicit confirmation before proceeding with "Dangerous Actions".
