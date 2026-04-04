package com.example.agent.di

import android.content.Context
import android.content.SharedPreferences
import androidx.room.Room
import com.example.agent.core.AgentLoop
import com.example.agent.core.ContextPruningManager
import com.example.agent.core.LlmInferenceWrapper
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
import javax.inject.Named
import javax.inject.Singleton

/**
 * # AgentModule — Hilt DI module per i Singleton di infrastruttura.
 *
 * ## Filosofia delle dipendenze
 *
 * Tutte le dipendenze pesanti — il motore di inferenza LLM, il database Room,
 * il gestore della memoria vettoriale — sono `@Singleton`. Android crea
 * un'unica istanza per il ciclo di vita dell'`Application`. In questo modo:
 *
 * - Il file del modello Gemma viene mappato in memoria **una sola volta** via mmap.
 *   Creare un secondo `LlmInference` istanzierebbe un secondo fd mmap sullo stesso
 *   file, sprecando VA space e potenzialmente confondendo il kernel con due
 *   reference count distinti sulle pagine shared.
 *
 * - Il database Room è intrinsecamente Singleton: costruirne più istanze con
 *   lo stesso path può causare lock file conflicts su SQLite e deadlock nelle query.
 *
 * ## LlmInferenceWrapper — lazy configurable Singleton
 *
 * Il percorso del modello dipende dalla scelta dell'utente in SharedPreferences
 * e può cambiare a runtime. Per gestire questo senza distruggere il grafo DI,
 * forniamo un [MutableLlmInferenceWrapper] — un wrapper che delega a un'istanza
 * interna swappabile via `initialize(path)`. L'[AgentOrchestrator] chiama
 * `initialize` in risposta all'intent [AgentIntent.InitializeModel].
 *
 * ## Thread safety
 * Tutti i `@Provides` sono chiamati dal thread principale durante l'init Hilt.
 * Le istanze Singleton prodotte sono poi usate su thread IO tramite coroutine.
 * Room e MediaPipe gestiscono internamente la propria thread safety.
 */
@Module
@InstallIn(SingletonComponent::class)
object AgentModule {

    // ─────────────────────────────────────────────────────────────────────────
    // Preferences
    // ─────────────────────────────────────────────────────────────────────────

    @Provides
    @Singleton
    @Named("userProfilePrefs")
    fun provideUserProfilePrefs(@ApplicationContext context: Context): SharedPreferences =
        context.getSharedPreferences("user_profile", Context.MODE_PRIVATE)

    // ─────────────────────────────────────────────────────────────────────────
    // VectorMemoryDB — Room database (STRICT Singleton)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Istanza Singleton del database Room.
     *
     * CRITICO: mai costruire più di una `AppDatabase` per lo stesso file.
     * Room usa un WAL (Write-Ahead Log) su SQLite; due istanze separate
     * non condividono la cache del WAL e possono causare `DatabaseObjectNotClosedException`.
     *
     * `fallbackToDestructiveMigration()` è accettabile in fase prototipale.
     * In produzione, fornire una `Migration` esplicita per ogni cambio di schema.
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

    // ─────────────────────────────────────────────────────────────────────────
    // EmbeddingModelWrapper — da sostituire con TFLite/MiniLM in produzione
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Fornisce il modello di embedding per la ricerca vettoriale.
     *
     * In produzione sostituire `DummyEmbeddingModel` con un'implementazione
     * TFLite che esegue MiniLM-L6 (384 dim) o un modello custom — che deve
     * anch'essa usare `setModelPath()` per il mmap.
     *
     * La `DummyEmbeddingModel` restituisce vettori costanti (0.1f × 384):
     * la cosine similarity sarà trivialmente 1.0 per tutti i testi, rendendo
     * il RAG inutile ma funzionalmente non crashante durante lo sviluppo.
     */
    @Provides
    @Singleton
    fun provideEmbeddingModel(): EmbeddingModelWrapper = DummyEmbeddingModel()

    // ─────────────────────────────────────────────────────────────────────────
    // LocalMemoryManager — facade su Room + embedding (STRICT Singleton)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Gestisce la memoria vettoriale a lungo termine e lo stato della conversazione.
     *
     * Dipende da [AppDatabase] (Singleton) e [EmbeddingModelWrapper] (Singleton),
     * garantendo che non ci sia mai più di una connessione aperta al DB.
     */
    @Provides
    @Singleton
    fun provideLocalMemoryManager(
        @ApplicationContext context: Context,
        embeddingModel: EmbeddingModelWrapper
    ): LocalMemoryManager = LocalMemoryManager(context, embeddingModel)

    // ─────────────────────────────────────────────────────────────────────────
    // LlmInferenceWrapper — lazy configurable Singleton (mmap-safe)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Fornisce il motore di inferenza locale come Singleton swappabile.
     *
     * [MutableLlmInferenceWrapper] parte con un `DummyLlmInference` (nessun modello
     * caricato) e si aggiorna quando [AgentOrchestrator] riceve `InitializeModel`.
     *
     * ## Perché non `MediaPipeLlmInference` direttamente?
     * Il percorso del modello dipende da SharedPreferences (scelta dell'utente) e
     * viene risolto solo dopo il download. Hilt costruisce il grafo DI al lancio
     * dell'app, quindi non abbiamo il path disponibile in anticipo.
     *
     * ## Sicurezza mmap
     * Quando `initialize(path)` swappa il delegate, il vecchio `LlmInference`
     * viene rilasciato (il suo `close()` è chiamato da `MediaPipeLlmInference`
     * in un `try-finally`). Le pagine mmap del vecchio modello vengono
     * rilasciate dal kernel non appena l'ultimo file descriptor viene chiuso.
     */
    @Provides
    @Singleton
    fun provideLlmInferenceWrapper(): LlmInferenceWrapper = MutableLlmInferenceWrapper()

    // ─────────────────────────────────────────────────────────────────────────
    // ContextPruningManager
    // ─────────────────────────────────────────────────────────────────────────

    @Provides
    @Singleton
    fun provideContextPruningManager(): ContextPruningManager =
        ContextPruningManager(
            maxContextTokens = 8192,
            pruneThresholdPercent = 0.75f,
            keepLastNTurns = 4
        )

    // ─────────────────────────────────────────────────────────────────────────
    // AgentLoop — core del ciclo ReAct
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * L'[AgentLoop] è Singleton perché mantiene il parser JSON e i riferimenti
     * alle dipendenze pesanti. Non ha stato mutabile proprio — tutto lo stato
     * di conversazione vive in [LocalMemoryManager] (Room).
     */
    @Provides
    @Singleton
    fun provideAgentLoop(
        llmInference: LlmInferenceWrapper,
        toolRegistry: ToolRegistry,
        memoryManager: LocalMemoryManager,
        pruner: ContextPruningManager
    ): AgentLoop = AgentLoop(
        llmInference = llmInference,
        toolRegistry = toolRegistry,
        memoryManager = memoryManager,
        pruner = pruner
    )

    // ─────────────────────────────────────────────────────────────────────────
    // ResourceManager (object → no Provider needed, ma lo rendiamo iniettabile)
    // ─────────────────────────────────────────────────────────────────────────

    @Provides
    @Singleton
    fun provideResourceManager(): ResourceManager = ResourceManager
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementazioni interne del modulo (non esposte fuori dal package di/*)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Embedding model fittizio — restituisce vettori costanti durante sviluppo/test.
 * Sostituire con l'implementazione TFLite per la produzione.
 */
private class DummyEmbeddingModel : EmbeddingModelWrapper {
    override suspend fun getEmbedding(text: String): FloatArray = FloatArray(384) { 0.1f }
}

/**
 * Wrapper del motore di inferenza con delegate swappabile a runtime.
 *
 * `@Volatile` su `delegate` garantisce visibilità tra thread senza lock overhead,
 * sufficiente per write-rare / read-frequent (il modello viene cambiato raramente).
 */
class MutableLlmInferenceWrapper : LlmInferenceWrapper {
    @Volatile
    private var delegate: LlmInferenceWrapper = DummyLlmInference()

    /** Sostituisce il motore attivo. Chiamato dall'AgentOrchestrator in risposta a InitializeModel. */
    fun initialize(newEngine: LlmInferenceWrapper) {
        delegate = newEngine
    }

    val isInitialized: Boolean
        get() = delegate !is DummyLlmInference

    override suspend fun generateResponse(prompt: String): String =
        delegate.generateResponse(prompt)
}

/** Fallback usato quando il modello non è ancora stato caricato. */
private class DummyLlmInference : LlmInferenceWrapper {
    override suspend fun generateResponse(prompt: String): String =
        "Error: Local model not initialized. Please download and select a model first."
}
