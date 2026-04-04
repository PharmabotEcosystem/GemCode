package com.example.agent.memory

import android.content.Context
import androidx.room.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlin.math.sqrt

// 1. Entità Room per memorizzare i chunk di testo e i loro embedding
@Entity(tableName = "memories")
data class MemoryEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val text: String,
    val embedding: String // Salvato come stringa JSON o ByteArray. Per semplicità qui usiamo String (es. "[0.1, 0.2, ...]")
)

@Entity(tableName = "conversation_states")
data class ConversationStateEntity(
    @PrimaryKey val id: Int = 1, // Usiamo un solo record per lo stato corrente
    val state: String,
    val timestamp: Long
)

// 2. DAO per accedere al database
@Dao
interface MemoryDao {
    @Insert
    suspend fun insert(memory: MemoryEntity)

    @Query("SELECT * FROM memories")
    suspend fun getAllMemories(): List<MemoryEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun saveConversationState(state: ConversationStateEntity)

    @Query("SELECT * FROM conversation_states WHERE id = 1")
    suspend fun getConversationState(): ConversationStateEntity?
}

// 3. Database Room
@Database(entities = [MemoryEntity::class, ConversationStateEntity::class], version = 2)
abstract class AppDatabase : RoomDatabase() {
    abstract fun memoryDao(): MemoryDao
}

/**
 * Gestisce la memoria a lungo termine dell'agente usando un database locale e ricerca vettoriale.
 */
class LocalMemoryManager(
    private val context: Context,
    private val embeddingModel: EmbeddingModelWrapper // Wrapper fittizio per un modello TFLite (es. MiniLM)
) {
    private val db = Room.databaseBuilder(
        context.applicationContext,
        AppDatabase::class.java, "agent_memory.db"
    ).build()

    /**
     * Salva una nuova memoria generando il suo embedding.
     */
    suspend fun saveMemory(text: String) = withContext(Dispatchers.IO) {
        // Genera embedding (es. vettore di 384 dimensioni per MiniLM)
        val vector = embeddingModel.getEmbedding(text)
        val vectorString = vector.joinToString(",") // Serializzazione semplice
        
        db.memoryDao().insert(MemoryEntity(text = text, embedding = vectorString))
    }

    /**
     * Salva lo stato corrente della conversazione.
     */
    suspend fun saveConversationState(state: String) = withContext(Dispatchers.IO) {
        db.memoryDao().saveConversationState(
            ConversationStateEntity(id = 1, state = state, timestamp = System.currentTimeMillis())
        )
    }

    /**
     * Recupera l'ultimo stato della conversazione salvato.
     */
    suspend fun getConversationState(): String? = withContext(Dispatchers.IO) {
        db.memoryDao().getConversationState()?.state
    }

    /**
     * Cerca le memorie più rilevanti rispetto a una query usando la similarità coseno.
     */
    suspend fun searchRelevantContext(query: String, topK: Int = 3): String = withContext(Dispatchers.IO) {
        val queryVector = embeddingModel.getEmbedding(query)
        val allMemories = db.memoryDao().getAllMemories()

        if (allMemories.isEmpty()) return@withContext "No previous context."

        // Calcola la similarità coseno per ogni memoria
        val scoredMemories = allMemories.map { entity ->
            val memoryVector = entity.embedding.split(",").map { it.toFloat() }.toFloatArray()
            val score = cosineSimilarity(queryVector, memoryVector)
            Pair(entity.text, score)
        }

        // Ordina per score decrescente e prendi i topK
        val topMemories = scoredMemories
            .sortedByDescending { it.second }
            .take(topK)
            .map { it.first }

        return@withContext topMemories.joinToString("\n---\n")
    }

    private fun cosineSimilarity(v1: FloatArray, v2: FloatArray): Float {
        var dotProduct = 0.0f
        var norm1 = 0.0f
        var norm2 = 0.0f
        for (i in v1.indices) {
            dotProduct += v1[i] * v2[i]
            norm1 += v1[i] * v1[i]
            norm2 += v2[i] * v2[i]
        }
        return if (norm1 == 0.0f || norm2 == 0.0f) 0.0f else (dotProduct / (sqrt(norm1) * sqrt(norm2)))
    }
}

// Wrapper fittizio per il modello di embedding
interface EmbeddingModelWrapper {
    suspend fun getEmbedding(text: String): FloatArray
}
