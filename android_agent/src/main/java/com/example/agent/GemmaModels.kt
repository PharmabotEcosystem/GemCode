package com.example.agent

/**
 * Model backend discriminator — determines how the model runs.
 * Used by [AgentOrchestrator] to route to the correct [LlmInferenceWrapper].
 */
enum class ModelBackend {
    /** LiteRT-LM on-device engine — requires a downloaded `.litertlm` file */
    LITERT,
    /** MediaPipe Tasks-GenAI — legacy, for `.task`/`.bin` files */
    MEDIAPIPE,
    /** LM Studio server on the local PC (OpenAI-compatible API, port 1234) */
    LM_STUDIO,
    /** Ollama running in Termux on the device (OpenAI-compatible API, port 11434) */
    OLLAMA,
}

/**
 * Describes a single downloadable/connectable AI model the user can activate.
 *
 * @param name       Human-readable display name shown in the Models screen.
 * @param url        Download URL for on-device models; empty for server-mode backends.
 * @param filename   Local filename inside `filesDir`; empty for server-mode backends.
 * @param useGpu     Whether to prefer GPU delegation (LiteRT-LM / MediaPipe only).
 * @param maxTokens  Maximum context window in tokens.
 * @param fileSizeMb Approximate download size in MB (used in the download button label).
 * @param backend    Routing discriminator — see [ModelBackend].
 */
data class GemmaModel(
    val name: String,
    val url: String = "",
    val filename: String = "",
    val useGpu: Boolean = false,
    val maxTokens: Int = 8192,
    val fileSizeMb: Int = 0,
    val backend: ModelBackend = ModelBackend.LITERT,
)

/**
 * The full list of models the user can select from the Models screen.
 *
 * Rules enforced by [AvailableModelsIntegrityTest]:
 *  - No Google Storage (`storage.googleapis.com/mediapipe-models`) URLs — they 404.
 *  - All HuggingFace download URLs must point to `.litertlm` files for LITERT backend.
 *  - Server-mode entries (LM_STUDIO, OLLAMA) must have empty `url` and `filename`.
 *  - Every downloadable model must declare a non-zero `fileSizeMb`.
 *  - Model names must be unique.
 */
val AVAILABLE_MODELS = listOf(
    // ── Server remoto (nessun download, inferenza su PC o Termux) ────────────
    GemmaModel("Ollama (locale Termux)",  backend = ModelBackend.OLLAMA,     maxTokens = 32768),
    GemmaModel("LM Studio (PC locale)",   backend = ModelBackend.LM_STUDIO,  maxTokens = 32768),
    // ── Gemma 4 — LiteRT-LM (.litertlm) — download HuggingFace litert-community ──
    GemmaModel("Gemma 4 E2B (CPU)", "https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it.litertlm?download=true", "gemma4_e2b_cpu.litertlm", useGpu = false, maxTokens = 8192, fileSizeMb = 2580),
    GemmaModel("Gemma 4 E2B (GPU)", "https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it.litertlm?download=true", "gemma4_e2b_gpu.litertlm", useGpu = true,  maxTokens = 8192, fileSizeMb = 2580),
    GemmaModel("Gemma 4 E4B (CPU)", "https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm/resolve/main/gemma-4-E4B-it.litertlm?download=true", "gemma4_e4b_cpu.litertlm", useGpu = false, maxTokens = 8192, fileSizeMb = 3650),
    GemmaModel("Gemma 4 E4B (GPU)", "https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm/resolve/main/gemma-4-E4B-it.litertlm?download=true", "gemma4_e4b_gpu.litertlm", useGpu = true,  maxTokens = 8192, fileSizeMb = 3650),
    // ── Gemma 3 — LiteRT-LM (rimpiazza Google Storage, ora su HuggingFace) ──
    GemmaModel("Gemma 3 1B (CPU)", "https://huggingface.co/litert-community/gemma-3-1b-it-litert-lm/resolve/main/gemma-3-1b-it.litertlm?download=true", "gemma3_1b_cpu.litertlm", useGpu = false, maxTokens = 8192, fileSizeMb = 700),
    GemmaModel("Gemma 3 1B (GPU)", "https://huggingface.co/litert-community/gemma-3-1b-it-litert-lm/resolve/main/gemma-3-1b-it.litertlm?download=true", "gemma3_1b_gpu.litertlm", useGpu = true,  maxTokens = 8192, fileSizeMb = 700),
    // ── Gemma 3n (Nano) — ottimizzato per mobile, forma fattore minima ────────
    GemmaModel("Gemma 3n E1B (CPU)", "https://huggingface.co/litert-community/gemma-3n-E1B-it-litert-lm/resolve/main/gemma-3n-E1B-it.litertlm?download=true", "gemma3n_e1b_cpu.litertlm", useGpu = false, maxTokens = 8192, fileSizeMb = 540),
    GemmaModel("Gemma 3n E1B (GPU)", "https://huggingface.co/litert-community/gemma-3n-E1B-it-litert-lm/resolve/main/gemma-3n-E1B-it.litertlm?download=true", "gemma3n_e1b_gpu.litertlm", useGpu = true,  maxTokens = 8192, fileSizeMb = 540),
    GemmaModel("Gemma 3n E4B (CPU)", "https://huggingface.co/litert-community/gemma-3n-E4B-it-litert-lm/resolve/main/gemma-3n-E4B-it.litertlm?download=true", "gemma3n_e4b_cpu.litertlm", useGpu = false, maxTokens = 8192, fileSizeMb = 2900),
)
