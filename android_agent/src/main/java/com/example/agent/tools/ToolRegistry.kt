package com.example.agent.tools

import android.util.Log
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton

/**
 * # ToolRegistry — catalogo a runtime dei tool disponibili all'agente.
 *
 * ## Perché un'interfaccia invece di una List<Tool>?
 * 1. **Estensibilità zero-modifica del core**: aggiungere un nuovo tool richiede solo
 *    un `@Provides @IntoSet` nel modulo Hilt — `AgentLoop` non va toccato.
 * 2. **Lookup O(1) per nome**: durante il parsing della risposta LLM, l'agente deve
 *    trovare il tool per nome ad ogni iterazione ReAct. Una Map batte la List.
 * 3. **Registrazione dinamica a runtime**: alcuni tool (es. plugin scaricati, skill
 *    generate dall'agente stesso via `SkillTool`) possono essere registrati dopo
 *    l'avvio senza reinizializzare l'intero grafo DI.
 * 4. **Testabilità**: i test unitari possono iniettare un `FakeToolRegistry`
 *    senza dipendere dall'intero modulo Hilt.
 */
interface ToolRegistry {
    /**
     * Restituisce tutti i tool attualmente registrati.
     * La collezione è un'istantanea thread-safe al momento della chiamata.
     */
    fun getAll(): Set<Tool>

    /**
     * Cerca un tool per nome esatto (case-sensitive, corrisponde a [Tool.name]).
     * Restituisce `null` se nessun tool corrisponde.
     */
    fun findByName(name: String): Tool?

    /**
     * Registra un tool dinamicamente a runtime (es. una skill generata da `SkillTool`).
     * Se esiste già un tool con lo stesso nome, viene **sostituito**.
     * Thread-safe.
     */
    fun register(tool: Tool)

    /**
     * Rimuove un tool registrato dinamicamente.
     * I tool forniti da Hilt via `@IntoSet` NON possono essere rimossi
     * (tornerebbero al prossimo rebuild del grafo).
     */
    fun unregister(toolName: String)

    /** Stringa formattata con i descrittori di tutti i tool — usata nel system prompt. */
    fun buildSystemPromptSection(): String
}

/**
 * Implementazione default iniettata da Hilt.
 *
 * Riceve il `Set<Tool>` via **Hilt multibinding** (`@IntoSet` / `@ElementsIntoSet`):
 * ogni tool dichiarato nel modulo `ToolsModule` viene automaticamente incluso
 * nel set senza modificare questa classe.
 *
 * Internamente usa una [ConcurrentHashMap] per garantire thread-safety durante
 * registrazioni dinamiche concorrenti (es. un tool che registra un sotto-tool
 * mentre l'AgentLoop è in esecuzione su Dispatchers.IO).
 */
@Singleton
class DefaultToolRegistry @Inject constructor(
    private val initialTools: Set<@JvmSuppressWildcards Tool>
) : ToolRegistry {

    companion object {
        private const val TAG = "ToolRegistry"
    }

    /**
     * Mappa [Tool.name] → [Tool]. Pre-popolata con i tool Hilt all'inizializzazione
     * e poi espansa con quelli registrati dinamicamente.
     *
     * [ConcurrentHashMap] garantisce:
     * - Letture lock-free e wait-free (utile nel loop ReAct su Dispatchers.IO)
     * - Scritture atomiche (nessuna race condition su `register()`)
     */
    private val registry = ConcurrentHashMap<String, Tool>().apply {
        initialTools.forEach { tool ->
            put(tool.name, tool)
            Log.d(TAG, "Registered static tool: ${tool.name}")
        }
    }

    override fun getAll(): Set<Tool> = registry.values.toSet()

    override fun findByName(name: String): Tool? = registry[name]

    override fun register(tool: Tool) {
        val replaced = registry.put(tool.name, tool)
        if (replaced != null) {
            Log.w(TAG, "Tool '${tool.name}' replaced an existing registration.")
        } else {
            Log.d(TAG, "Dynamically registered tool: ${tool.name}")
        }
    }

    override fun unregister(toolName: String) {
        registry.remove(toolName)?.also {
            Log.d(TAG, "Unregistered tool: $toolName")
        } ?: Log.w(TAG, "Attempted to unregister unknown tool: $toolName")
    }

    /**
     * Produce la sezione del system prompt che descrive i tool all'LLM.
     * Chiamato da [com.example.agent.core.AgentLoop.buildSystemPrompt].
     */
    override fun buildSystemPromptSection(): String =
        getAll().joinToString("\n") { tool ->
            "- ${tool.name}: ${tool.description}\n  Schema: ${tool.parametersSchema}"
        }
}
