package com.example.agent.di

import android.content.Context
import android.content.SharedPreferences
import com.example.agent.core.AgentLoop
import com.example.agent.core.ContextPruningManager
import com.example.agent.core.DeviceStatusProvider
import com.example.agent.core.LlmInferenceWrapper
import com.example.agent.core.SafetyGuard
import com.example.agent.core.SystemPromptBuilder
import com.example.agent.memory.AppDatabase
import com.example.agent.memory.EmbeddingModelWrapper
import com.example.agent.memory.LocalMemoryManager
import com.example.agent.service.ResourceManager
import com.example.agent.shizuku.ShizukuCommandExecutor
import com.example.agent.tools.ToolRegistry
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import androidx.room.Room
import javax.inject.Named
import javax.inject.Singleton

/**
 * # AgentModule — Hilt DI module per i Singleton di infrastruttura.
 *
 * ## Gerarchia delle dipendenze
 * ```
 * ApplicationContext
 *   ├── AppDatabase (Room, Singleton)
 *   ├── EmbeddingModelWrapper (Singleton)
 *   ├── LocalMemoryManager → AppDatabase + EmbeddingModelWrapper
 *   ├── ShizukuCommandExecutor (Singleton, @Inject constructor)
 *   ├── DeviceStatusProvider → Context + ShizukuCommandExecutor
 *   ├── MutableLlmInferenceWrapper (Singleton — lazy-init via InitializeModel)
 *   ├── ContextPruningManager (Singleton)
 *   ├── SafetyGuard (Singleton, @Inject constructor)
 *   ├── SystemPromptBuilder → DeviceStatusProvider + ToolRegistry
 *   └── AgentLoop → LlmInference + ToolRegistry + Memory + Pruner + PromptBuilder + SafetyGuard
 * ```
 *
 * ## Nota su MutableLlmInferenceWrapper
 * Il percorso del modello Gemma dipende dalla scelta utente in SharedPreferences
 * e può cambiare a runtime. Hilt costruisce il grafo al lancio dell'app, prima che
 * il modello sia scelto o scaricato. Per questo forniamo un wrapper swappabile:
 * - All'avvio: `DummyLlmInference` (risponde con errore esplicito)
 * - Dopo `AgentIntent.InitializeModel`: `MediaPipeLlmInference` (mmap attivo)
 */
@Module
@InstallIn(SingletonComponent::class)
object AgentModule {

    // ── SharedPreferences ─────────────────────────────────────────────────────

    @Provides
    @Singleton
    @Named("userProfilePrefs")
    fun provideUserProfilePrefs(@ApplicationContext context: Context): SharedPreferences =
        context.getSharedPreferences("user_profile", Context.MODE_PRIVATE)

    // ── Room Database (VectorMemoryDB) ────────────────────────────────────────

    /**
     * Singleton Room database.
     * CRITICO: una sola istanza per file — Room usa WAL, due istanze causano lock conflict.
     */
    @Provides
    @Singleton
    fun provideAppDatabase(@ApplicationContext context: Context): AppDatabase =
        Room.databaseBuilder(
            context.applicationContext,
            AppDatabase::class.java,
            "agent_memory.db"
        )
            .fallbackToDestructiveMigration()
            .build()

    // ── Embedding model ────────────────────────────────────────────────────────

    /**
     * Placeholder embedding model — restituisce vettori costanti.
     * Sostituire con TFLite MiniLM-L6 (384 dim) in produzione.
     */
    @Provides
    @Singleton
    fun provideEmbeddingModel(): EmbeddingModelWrapper = DummyEmbeddingModel()

    // ── LocalMemoryManager (VectorMemoryDB facade) ────────────────────────────

    @Provides
    @Singleton
    fun provideLocalMemoryManager(
        @ApplicationContext context: Context,
        embeddingModel: EmbeddingModelWrapper
    ): LocalMemoryManager = LocalMemoryManager(context, embeddingModel)

    // ── LlmInferenceWrapper (lazy-swappable Singleton) ────────────────────────

    /**
     * Fornisce [MutableLlmInferenceWrapper] come [LlmInferenceWrapper].
     * Il modello effettivo viene caricato da [AgentOrchestrator] via
     * `AgentIntent.InitializeModel` → `llmWrapper.initialize(MediaPipeLlmInference(...))`.
     *
     * mmap safety: `MediaPipeLlmInference` usa `setModelPath()` → mmap nativo.
     * Non caricare mai i pesi come ByteArray.
     */
    @Provides
    @Singleton
    fun provideLlmInferenceWrapper(): LlmInferenceWrapper = MutableLlmInferenceWrapper()

    /**
     * Espone anche la classe concreta [MutableLlmInferenceWrapper] per i clienti
     * che devono chiamare `initialize()` (es. [AgentOrchestrator]).
     * Questa istanza È la stessa fornita come [LlmInferenceWrapper] — il cast è safe.
     */
    @Provides
    @Singleton
    fun provideMutableLlmWrapper(): MutableLlmInferenceWrapper = MutableLlmInferenceWrapper()

    // ── ContextPruningManager ─────────────────────────────────────────────────

    @Provides
    @Singleton
    fun provideContextPruningManager(): ContextPruningManager =
        ContextPruningManager(
            maxContextTokens = 8192,
            pruneThresholdPercent = 0.75f,
            keepLastNTurns = 4
        )

    // ── DeviceStatusProvider ──────────────────────────────────────────────────

    /**
     * Fornisce snapshot in tempo reale di batteria, RAM e stato Shizuku.
     * Usato da [SystemPromptBuilder] per il Layer 2 del system prompt.
     * Le letture sono non-bloccanti (BatteryManager sticky broadcast, ActivityManager IPC).
     */
    @Provides
    @Singleton
    fun provideDeviceStatusProvider(
        @ApplicationContext context: Context,
        shizukuExecutor: ShizukuCommandExecutor
    ): DeviceStatusProvider = DeviceStatusProvider(context, shizukuExecutor)

    // ── SystemPromptBuilder ───────────────────────────────────────────────────

    /**
     * Costruisce il system prompt completo ad ogni inferenza:
     * Constitution (immutabile) + Device Status + Tool Manifest + RAG Context.
     *
     * La [SystemPromptBuilder.CONSTITUTION] è un `const val` compile-time —
     * non può essere modificata da SharedPreferences, Intent, o input utente.
     */
    @Provides
    @Singleton
    fun provideSystemPromptBuilder(
        deviceStatusProvider: DeviceStatusProvider,
        toolRegistry: ToolRegistry
    ): SystemPromptBuilder = SystemPromptBuilder(deviceStatusProvider, toolRegistry)

    // ── SafetyGuard ────────────────────────────────────────────────────────────

    /**
     * Intercettore di sicurezza — valuta ogni tool call prima dell'esecuzione.
     * [SafetyGuard] ha `@Inject constructor()` e non ha dipendenze esterne,
     * ma lo esplicitiamo qui per visibilità nel grafo DI.
     */
    @Provides
    @Singleton
    fun provideSafetyGuard(): SafetyGuard = SafetyGuard()

    // ── AgentLoop ─────────────────────────────────────────────────────────────

    /**
     * Core del ciclo ReAct. Singleton per preservare il parser JSON e le
     * referenze alle dipendenze pesanti. Lo stato della conversazione vive
     * in [LocalMemoryManager] (Room), non nell'AgentLoop.
     */
    @Provides
    @Singleton
    fun provideAgentLoop(
        llmInference: LlmInferenceWrapper,
        toolRegistry: ToolRegistry,
        memoryManager: LocalMemoryManager,
        pruner: ContextPruningManager,
        systemPromptBuilder: SystemPromptBuilder,
        safetyGuard: SafetyGuard
    ): AgentLoop = AgentLoop(
        llmInference = llmInference,
        toolRegistry = toolRegistry,
        memoryManager = memoryManager,
        pruner = pruner,
        systemPromptBuilder = systemPromptBuilder,
        safetyGuard = safetyGuard
    )

    // ── ResourceManager ────────────────────────────────────────────────────────

    @Provides
    @Singleton
    fun provideResourceManager(): ResourceManager = ResourceManager
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementazioni interne
// ─────────────────────────────────────────────────────────────────────────────

private class DummyEmbeddingModel : EmbeddingModelWrapper {
    override suspend fun getEmbedding(text: String): FloatArray = FloatArray(384) { 0.1f }
}

/**
 * Wrapper del motore di inferenza con delegate swappabile a runtime.
 *
 * `@Volatile` su `delegate` garantisce visibilità cross-thread senza lock.
 * Sufficiente per write-rare (cambio modello) / read-frequent (ogni inferenza).
 */
class MutableLlmInferenceWrapper : LlmInferenceWrapper {
    @Volatile
    private var delegate: LlmInferenceWrapper = UninitializedLlmInference()

    fun initialize(newEngine: LlmInferenceWrapper) {
        val old = delegate
        delegate = newEngine
        // Rilascia l'engine precedente se implementa Closeable
        if (old is AutoCloseable) try { old.close() } catch (_: Exception) {}
    }

    val isInitialized: Boolean
        get() = delegate !is UninitializedLlmInference

    override suspend fun generateResponse(prompt: String): String =
        delegate.generateResponse(prompt)
}

private class UninitializedLlmInference : LlmInferenceWrapper {
    override suspend fun generateResponse(prompt: String): String =
        "AGENT ERROR: Local model not initialized. " +
                "Dispatch AgentIntent.InitializeModel(modelPath) before sending prompts."
}
