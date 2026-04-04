package com.example.agent.tools

import kotlinx.serialization.json.JsonElement

/**
 * Interfaccia base per tutti i Tool dell'agente.
 */
interface Tool {
    val name: String
    val description: String
    val parametersSchema: String // JSON Schema come stringa

    /**
     * Esegue il tool con i parametri forniti dal modello.
     * @param params Parametri in formato JSON
     * @return Il risultato dell'esecuzione (Observation)
     */
    suspend fun execute(params: JsonElement): String
}
