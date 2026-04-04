package com.example.agent

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.Settings
import android.content.Context
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.lifecycle.lifecycleScope
import androidx.compose.foundation.Image
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.ui.draw.clip
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Person
import androidx.compose.foundation.clickable
import android.graphics.BitmapFactory
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import com.example.agent.core.AgentLoop
import com.example.agent.core.MediaPipeLlmInference
import com.example.agent.core.ModelDownloader
import com.example.agent.core.DownloadState
import java.io.File
import kotlinx.coroutines.flow.collectLatest
import com.example.agent.memory.EmbeddingModelWrapper
import com.example.agent.memory.LocalMemoryManager
import com.example.agent.core.SkillManager
import com.example.agent.tools.AgentAccessibilityService
import com.example.agent.tools.FileSystemTool
import com.example.agent.tools.SettingsTool
import com.example.agent.tools.UIInteractTool
import com.example.agent.tools.SkillTool
import com.example.agent.tools.GoogleIntegrationTool
import com.example.agent.tools.MCPTool
import com.example.agent.ui.ShizukuSetupCard
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.background
import androidx.compose.ui.Alignment

import android.content.pm.PackageManager
import com.example.agent.ui.ShizukuState
import com.example.agent.ui.checkShizukuState
import rikka.shizuku.Shizuku

/**
 * Descrittore di un modello Gemma scaricabile e caricabile in locale.
 *
 * @param name        Etichetta visualizzata nella UI
 * @param url         URL di download diretto (nessuna autenticazione richiesta)
 * @param filename    Nome del file salvato in [Context.filesDir]
 * @param useGpu      True → richiede backend GPU a MediaPipe (fallback CPU automatico)
 * @param maxTokens   Finestra di contesto massima (Gemma 2B: 1024; Gemma 3/4: 8192)
 * @param fileSizeMb  Dimensione approssimativa in MB (per la UI)
 */
data class GemmaModel(
    val name: String,
    val url: String,
    val filename: String,
    val useGpu: Boolean = false,
    val maxTokens: Int = 1024,
    val fileSizeMb: Int = 0
)

/**
 * Catalogo dei modelli Gemma disponibili per il download e l'uso in locale.
 *
 * ## Formato dei file
 * - `.task` — LiteRT Task Bundle (Gemma 3 / Gemma 4): contiene pesi + metadata in un singolo archivio
 * - `.bin`  — formato legacy MediaPipe (Gemma 2B)
 *
 * ## URL
 * I modelli Gemma 3 e Gemma 4 sono distribuiti da Google AI Edge tramite il bucket
 * `storage.googleapis.com/mediapipe-models`. Nessuna API key, nessun account richiesto.
 * In caso di URL non più valido (Google aggiorna i percorsi), verificare:
 * https://ai.google.dev/edge/mediapipe/solutions/genai/llm_inference/android
 */
val AVAILABLE_MODELS = listOf(

    // ── Gemma 4 1B — on-device, Google I/O 2025 ─────────────────────────────
    // Architettura ottimizzata per mobile: ~700 MB int4, finestra 8192 token
    GemmaModel(
        name = "Gemma 4 1B IT (CPU, int4)  ~700 MB",
        url = "https://storage.googleapis.com/mediapipe-models/llm_inference/gemma4-1b-it-cpu-int4/float16/1/gemma4-1b-it-cpu-int4.task",
        filename = "gemma4_1b_it_cpu_int4.task",
        useGpu = false,
        maxTokens = 8192,
        fileSizeMb = 700
    ),
    GemmaModel(
        name = "Gemma 4 1B IT (GPU, int4)  ~700 MB",
        url = "https://storage.googleapis.com/mediapipe-models/llm_inference/gemma4-1b-it-gpu-int4/float16/1/gemma4-1b-it-gpu-int4.task",
        filename = "gemma4_1b_it_gpu_int4.task",
        useGpu = true,
        maxTokens = 8192,
        fileSizeMb = 700
    ),

    // ── Gemma 3 1B — fallback stabile, confermato su MediaPipe 0.10.22 ───────
    GemmaModel(
        name = "Gemma 3 1B IT (CPU, int4)  ~700 MB",
        url = "https://storage.googleapis.com/mediapipe-models/llm_inference/gemma3-1b-it-cpu-int4/float16/1/gemma3-1b-it-cpu-int4.task",
        filename = "gemma3_1b_it_cpu_int4.task",
        useGpu = false,
        maxTokens = 8192,
        fileSizeMb = 700
    ),
    GemmaModel(
        name = "Gemma 3 1B IT (GPU, int4)  ~700 MB",
        url = "https://storage.googleapis.com/mediapipe-models/llm_inference/gemma3-1b-it-gpu-int4/float16/1/gemma3-1b-it-gpu-int4.task",
        filename = "gemma3_1b_it_gpu_int4.task",
        useGpu = true,
        maxTokens = 8192,
        fileSizeMb = 700
    ),

    // ── Gemma 2B — modelli legacy (formato .bin, CPU/GPU) ────────────────────
    GemmaModel(
        name = "Gemma 2B IT (CPU, int4)  ~1.5 GB",
        url = "https://storage.googleapis.com/mediapipe-models/llm_inference/gemma_cpu/v3/gemma-2b-it-cpu-int4.bin",
        filename = "gemma_2b_it_cpu_int4.bin",
        useGpu = false,
        maxTokens = 1024,
        fileSizeMb = 1500
    ),
    GemmaModel(
        name = "Gemma 2B IT (CPU, int8)  ~2 GB",
        url = "https://storage.googleapis.com/mediapipe-models/llm_inference/gemma_cpu/v3/gemma-2b-it-cpu-int8.bin",
        filename = "gemma_2b_it_cpu_int8.bin",
        useGpu = false,
        maxTokens = 1024,
        fileSizeMb = 2000
    ),
    GemmaModel(
        name = "Gemma 2B IT (GPU, int4)  ~1.5 GB",
        url = "https://storage.googleapis.com/mediapipe-models/llm_inference/gemma_gpu/v3/gemma-2b-it-gpu-int4.bin",
        filename = "gemma_2b_it_gpu_int4.bin",
        useGpu = true,
        maxTokens = 1024,
        fileSizeMb = 1500
    ),
    GemmaModel(
        name = "Gemma 2B IT (GPU, int8)  ~2 GB",
        url = "https://storage.googleapis.com/mediapipe-models/llm_inference/gemma_gpu/v3/gemma-2b-it-gpu-int8.bin",
        filename = "gemma_2b_it_gpu_int8.bin",
        useGpu = true,
        maxTokens = 1024,
        fileSizeMb = 2000
    )
)

class MainActivity : ComponentActivity(), Shizuku.OnRequestPermissionResultListener {

    private lateinit var agentLoop: AgentLoop
    private var shizukuState by mutableStateOf(ShizukuState.UNAVAILABLE)
    private var hasStoragePermission by mutableStateOf(false)
    private var conversationHistory by mutableStateOf("")
    private var isAgentRunning by mutableStateOf(false)
    private var username by mutableStateOf("Agent User")
    private var avatarPath by mutableStateOf<String?>(null)
    private var selectedModelIndex by mutableStateOf(0)

    private val binderReceivedListener = Shizuku.OnBinderReceivedListener {
        updateShizukuState()
    }

    private val binderDeadListener = Shizuku.OnBinderDeadListener {
        shizukuState = ShizukuState.UNAVAILABLE
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        val prefs = getSharedPreferences("user_profile", Context.MODE_PRIVATE)
        
        val savedShizukuState = prefs.getString("shizukuState", ShizukuState.UNAVAILABLE.name) ?: ShizukuState.UNAVAILABLE.name
        shizukuState = try { ShizukuState.valueOf(savedShizukuState) } catch (e: Exception) { ShizukuState.UNAVAILABLE }
        hasStoragePermission = prefs.getBoolean("hasStoragePermission", false)
        
        username = prefs.getString("username", "Agent User") ?: "Agent User"
        avatarPath = prefs.getString("avatarPath", null)
        
        var savedIndex = prefs.getInt("selectedModelIndex", 0)
        if (savedIndex < 0 || savedIndex >= AVAILABLE_MODELS.size) {
            savedIndex = 0
        }
        selectedModelIndex = savedIndex

        // Register Shizuku listeners
        Shizuku.addRequestPermissionResultListener(this)
        Shizuku.addBinderReceivedListener(binderReceivedListener)
        Shizuku.addBinderDeadListener(binderDeadListener)
        
        updateShizukuState()
        hasStoragePermission = checkStoragePermission()
        prefs.edit().putBoolean("hasStoragePermission", hasStoragePermission).apply()

        // 1. Inizializzazione delle dipendenze Core (Memoria e LLM)
        val memoryManager = LocalMemoryManager(
            context = applicationContext,
            embeddingModel = DummyEmbeddingModel() // Sostituire con l'istanza reale TFLite
        )
        
        val selectedModel = AVAILABLE_MODELS[selectedModelIndex]
        val modelFile = File(applicationContext.filesDir, selectedModel.filename)
        val llmInference = if (modelFile.exists()) {
            MediaPipeLlmInference(
                context = applicationContext,
                modelPath = modelFile.absolutePath,
                useGpu = selectedModel.useGpu,
                maxTokens = selectedModel.maxTokens
            )
        } else {
            DummyLlmInference() // Fallback temporaneo se il modello non è stato scaricato
        }

        // 2. Istanziazione dei Tool
        val fileSystemTool = FileSystemTool()
        val settingsTool = SettingsTool()
        
        // UIInteractTool recupera l'istanza del servizio dal companion object internamente.
        val uiInteractTool = UIInteractTool()
        
        val skillManager = SkillManager(applicationContext)
        val skillTool = SkillTool(skillManager)
        val googleIntegrationTool = GoogleIntegrationTool(applicationContext)
        val mcpTool = MCPTool()

        // 3. Creazione dell'AgentLoop iniettando la lista dei tool
        agentLoop = AgentLoop(
            llmInference = llmInference,
            tools = listOf(fileSystemTool, settingsTool, uiInteractTool, skillTool, googleIntegrationTool, mcpTool),
            memoryManager = memoryManager
        )

        lifecycleScope.launch {
            conversationHistory = memoryManager.getConversationState() ?: ""
        }

        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    AgentScreen(
                        shizukuState = shizukuState,
                        hasStoragePermission = hasStoragePermission,
                        conversationHistory = conversationHistory,
                        isAgentRunning = isAgentRunning,
                        username = username,
                        avatarPath = avatarPath,
                        selectedModelIndex = selectedModelIndex,
                        onUsernameChange = { newName ->
                            username = newName
                            prefs.edit().putString("username", newName).apply()
                        },
                        onAvatarChange = { newPath ->
                            avatarPath = newPath
                            prefs.edit().putString("avatarPath", newPath).apply()
                        },
                        onModelChange = { newIndex ->
                            selectedModelIndex = newIndex
                            prefs.edit().putInt("selectedModelIndex", newIndex).apply()
                            
                            val newModel = AVAILABLE_MODELS[newIndex]
                            val newModelFile = File(applicationContext.filesDir, newModel.filename)
                            if (newModelFile.exists()) {
                                agentLoop = AgentLoop(
                                    tools = listOf(fileSystemTool, settingsTool, uiInteractTool, skillTool, googleIntegrationTool, mcpTool),
                                    llmInference = MediaPipeLlmInference(
                                        context = applicationContext,
                                        modelPath = newModelFile.absolutePath,
                                        useGpu = newModel.useGpu,
                                        maxTokens = newModel.maxTokens
                                    ),
                                    memoryManager = memoryManager
                                )
                            }
                        },
                        onRequestShizukuPermission = { Shizuku.requestPermission(100) },
                        onRequestStoragePermission = { requestManageStoragePermission() },
                        onTakePhoto = {
                            val params = buildJsonObject {
                                put("action", "take_photo")
                            }
                            uiInteractTool.execute(params)
                        },
                        onRunAgent = { prompt ->
                            isAgentRunning = true
                            // Aggiungiamo subito il prompt dell'utente alla UI
                            val newHistory = if (conversationHistory.isNotEmpty()) {
                                "$conversationHistory\nUser: $prompt\n"
                            } else {
                                "User: $prompt\n"
                            }
                            conversationHistory = newHistory
                            
                            CoroutineScope(Dispatchers.IO).launch {
                                agentLoop.run(prompt)
                                val updatedHistory = memoryManager.getConversationState() ?: ""
                                withContext(Dispatchers.Main) {
                                    conversationHistory = updatedHistory
                                    isAgentRunning = false
                                }
                            }
                        }
                    )
                }
            }
        }
    }

    override fun onRequestPermissionResult(requestCode: Int, grantResult: Int) {
        if (requestCode == 100) {
            updateShizukuState()
        }
    }

    private fun updateShizukuState() {
        shizukuState = checkShizukuState()
        getSharedPreferences("user_profile", Context.MODE_PRIVATE)
            .edit()
            .putString("shizukuState", shizukuState.name)
            .apply()
    }

    override fun onDestroy() {
        super.onDestroy()
        Shizuku.removeRequestPermissionResultListener(this)
        Shizuku.removeBinderReceivedListener(binderReceivedListener)
        Shizuku.removeBinderDeadListener(binderDeadListener)
    }

    override fun onResume() {
        super.onResume()
        // Aggiorna lo stato dei permessi quando l'utente torna dall'app Impostazioni
        hasStoragePermission = checkStoragePermission()
        getSharedPreferences("user_profile", Context.MODE_PRIVATE)
            .edit()
            .putBoolean("hasStoragePermission", hasStoragePermission)
            .apply()
    }

    private fun checkStoragePermission(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Environment.isExternalStorageManager()
        } else {
            true // Per API < 30, assumiamo che i permessi standard siano gestiti altrove
        }
    }

    /**
     * Richiede il permesso MANAGE_EXTERNAL_STORAGE su Android 11+
     * per permettere al FileSystemTool di operare ovunque.
     */
    private fun requestManageStoragePermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            if (!Environment.isExternalStorageManager()) {
                val intent = Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION).apply {
                    data = Uri.parse("package:${packageName}")
                }
                startActivity(intent)
            }
        }
    }
}

@Composable
fun AgentScreen(
    shizukuState: ShizukuState,
    hasStoragePermission: Boolean,
    conversationHistory: String,
    isAgentRunning: Boolean,
    username: String,
    avatarPath: String?,
    selectedModelIndex: Int,
    onUsernameChange: (String) -> Unit,
    onAvatarChange: (String) -> Unit,
    onModelChange: (Int) -> Unit,
    onRequestShizukuPermission: () -> Unit,
    onRequestStoragePermission: () -> Unit,
    onTakePhoto: suspend () -> String,
    onRunAgent: (String) -> Unit
) {
    var userInput by remember { mutableStateOf("") }
    var capturedImagePath by remember { mutableStateOf<String?>(null) }
    var photoMessage by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    Column(modifier = Modifier.padding(16.dp).fillMaxSize()) {
        Text("Autonomous Android Agent", style = MaterialTheme.typography.headlineMedium)
        
        if (isAgentRunning) {
            Spacer(modifier = Modifier.height(8.dp))
            LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            Spacer(modifier = Modifier.height(8.dp))
        } else {
            Spacer(modifier = Modifier.height(16.dp))
        }
        
        UserProfileCard(
            username = username,
            avatarPath = avatarPath,
            onUsernameChange = onUsernameChange,
            onAvatarClick = {
                scope.launch {
                    val result = onTakePhoto()
                    if (result.startsWith("Success: Photo saved to")) {
                        val path = result.substringAfter("Success: Photo saved to").trim()
                        onAvatarChange(path)
                    }
                }
            }
        )
        
        Spacer(modifier = Modifier.height(16.dp))
        
        ModelSelectionCard(
            selectedModelIndex = selectedModelIndex,
            onModelChange = onModelChange
        )
        
        Spacer(modifier = Modifier.height(16.dp))
        
        // UI per il setup di Shizuku (SettingsTool)
        ShizukuSetupCard(
            shizukuState = shizukuState,
            onRequestPermission = onRequestShizukuPermission
        )

        Spacer(modifier = Modifier.height(16.dp))

        // UI per richiedere i permessi del FileSystemTool
        if (!hasStoragePermission) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "Storage Permission Required",
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onErrorContainer
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "The agent needs full storage access to read and write files via FileSystemTool.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onErrorContainer
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Button(
                        onClick = onRequestStoragePermission,
                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
                    ) {
                        Text("Grant Storage Access")
                    }
                }
            }
            Spacer(modifier = Modifier.height(16.dp))
        }

        // Take Photo Button & Preview
        Card(
            modifier = Modifier.fillMaxWidth(),
            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("Camera Tool Test", style = MaterialTheme.typography.titleMedium)
                Spacer(modifier = Modifier.height(8.dp))
                Button(onClick = {
                    scope.launch {
                        photoMessage = "Capturing..."
                        val result = onTakePhoto()
                        if (result.startsWith("Success: Photo saved to")) {
                            capturedImagePath = result.substringAfter("Success: Photo saved to").trim()
                            photoMessage = "Photo captured successfully!"
                        } else {
                            photoMessage = result
                        }
                    }
                }) {
                    Text("Take Photo")
                }
                
                photoMessage?.let { 
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = it, 
                        style = MaterialTheme.typography.bodyMedium, 
                        color = if (it.startsWith("Error")) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface
                    ) 
                }
                
                capturedImagePath?.let { path ->
                    var capturedBitmap by remember(path) { mutableStateOf<android.graphics.Bitmap?>(null) }
                    LaunchedEffect(path) {
                        capturedBitmap = withContext(Dispatchers.IO) {
                            BitmapFactory.decodeFile(path)
                        }
                    }
                    if (capturedBitmap != null) {
                        Spacer(modifier = Modifier.height(8.dp))
                        Image(
                            bitmap = capturedBitmap!!.asImageBitmap(),
                            contentDescription = "Captured Photo",
                            modifier = Modifier.fillMaxWidth().height(200.dp),
                            contentScale = ContentScale.Fit
                        )
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Conversation History
        Text("Conversation History", style = MaterialTheme.typography.titleMedium)
        Spacer(modifier = Modifier.height(8.dp))
        
        val messages = remember(conversationHistory) { parseConversationHistory(conversationHistory) }
        val listState = rememberLazyListState()
        
        LaunchedEffect(messages.size) {
            if (messages.isNotEmpty()) {
                listState.animateScrollToItem(messages.size - 1)
            }
        }
        
        LazyColumn(
            state = listState,
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f), shape = MaterialTheme.shapes.medium)
                .padding(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            if (messages.isEmpty()) {
                item {
                    Text(
                        text = "No history yet.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(8.dp)
                    )
                }
            } else {
                items(messages) { msg ->
                    val isUser = msg.role == "User"
                    val isObs = msg.role == "Observation"
                    
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start
                    ) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth(0.85f)
                                .background(
                                    color = when {
                                        isUser -> MaterialTheme.colorScheme.primaryContainer
                                        isObs -> MaterialTheme.colorScheme.surfaceVariant
                                        else -> MaterialTheme.colorScheme.secondaryContainer
                                    },
                                    shape = RoundedCornerShape(
                                        topStart = 16.dp,
                                        topEnd = 16.dp,
                                        bottomStart = if (isUser) 16.dp else 4.dp,
                                        bottomEnd = if (isUser) 4.dp else 16.dp
                                    )
                                )
                                .padding(12.dp)
                        ) {
                            Column {
                                Text(
                                    text = msg.role,
                                    style = MaterialTheme.typography.labelSmall,
                                    color = when {
                                        isUser -> MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.7f)
                                        isObs -> MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
                                        else -> MaterialTheme.colorScheme.onSecondaryContainer.copy(alpha = 0.7f)
                                    }
                                )
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(
                                    text = msg.content,
                                    style = if (isObs) MaterialTheme.typography.bodySmall else MaterialTheme.typography.bodyMedium,
                                    color = when {
                                        isUser -> MaterialTheme.colorScheme.onPrimaryContainer
                                        isObs -> MaterialTheme.colorScheme.onSurfaceVariant
                                        else -> MaterialTheme.colorScheme.onSecondaryContainer
                                    }
                                )
                            }
                        }
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Input field and button
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            OutlinedTextField(
                value = userInput,
                onValueChange = { userInput = it },
                modifier = Modifier.weight(1f),
                placeholder = { Text("Enter prompt...") },
                enabled = !isAgentRunning,
                shape = RoundedCornerShape(24.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = MaterialTheme.colorScheme.primary,
                    unfocusedBorderColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.5f)
                )
            )
            Spacer(modifier = Modifier.width(8.dp))
            
            val isSendEnabled = hasStoragePermission && shizukuState == ShizukuState.AUTHORIZED && !isAgentRunning && userInput.isNotBlank()
            
            IconButton(
                onClick = { 
                    if (userInput.isNotBlank()) {
                        onRunAgent(userInput)
                        userInput = ""
                    }
                },
                enabled = isSendEnabled,
                modifier = Modifier
                    .size(48.dp)
                    .background(
                        color = if (isSendEnabled) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
                        shape = androidx.compose.foundation.shape.CircleShape
                    )
            ) {
                if (isAgentRunning) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(24.dp), 
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f),
                        strokeWidth = 2.dp
                    )
                } else {
                    Icon(
                        imageVector = Icons.Filled.Send,
                        contentDescription = "Send",
                        tint = if (isSendEnabled) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}

@Composable
fun UserProfileCard(
    username: String,
    avatarPath: String?,
    onUsernameChange: (String) -> Unit,
    onAvatarClick: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .size(64.dp)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.primaryContainer)
                        .clickable { onAvatarClick() },
                    contentAlignment = Alignment.Center
                ) {
                    var bitmap by remember(avatarPath) { mutableStateOf<android.graphics.Bitmap?>(null) }
                    LaunchedEffect(avatarPath) {
                        if (avatarPath != null) {
                            bitmap = withContext(Dispatchers.IO) {
                                BitmapFactory.decodeFile(avatarPath)
                            }
                        } else {
                            bitmap = null
                        }
                    }
                    
                    if (bitmap != null) {
                        Image(
                            bitmap = bitmap!!.asImageBitmap(),
                            contentDescription = "Avatar",
                            modifier = Modifier.fillMaxSize(),
                            contentScale = ContentScale.Crop
                        )
                    } else {
                        Icon(Icons.Default.Person, contentDescription = "Avatar", modifier = Modifier.size(32.dp))
                    }
                }
                Spacer(modifier = Modifier.width(16.dp))
                OutlinedTextField(
                    value = username,
                    onValueChange = onUsernameChange,
                    label = { Text("Username") },
                    modifier = Modifier.weight(1f),
                    singleLine = true
                )
            }
        }
    }
}

@Composable
fun ModelSelectionCard(
    selectedModelIndex: Int,
    onModelChange: (Int) -> Unit
) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val scope = rememberCoroutineScope()
    var expanded by remember { mutableStateOf(false) }
    var downloadState by remember { mutableStateOf<DownloadState>(DownloadState.Idle) }
    
    val selectedModel = AVAILABLE_MODELS[selectedModelIndex]
    val modelFile = File(context.filesDir, selectedModel.filename)
    var isModelLocal by remember(selectedModelIndex) { mutableStateOf(modelFile.exists()) }

    Card(
        modifier = Modifier.fillMaxWidth(),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text("Local LLM Model", style = MaterialTheme.typography.titleMedium)
            Spacer(modifier = Modifier.height(8.dp))
            
            Box {
                OutlinedButton(
                    onClick = { expanded = true },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(selectedModel.name)
                }
                DropdownMenu(
                    expanded = expanded,
                    onDismissRequest = { expanded = false }
                ) {
                    AVAILABLE_MODELS.forEachIndexed { index, model ->
                        DropdownMenuItem(
                            text = { Text(model.name) },
                            onClick = {
                                onModelChange(index)
                                expanded = false
                                downloadState = DownloadState.Idle
                            }
                        )
                    }
                }
            }
            
            Spacer(modifier = Modifier.height(8.dp))
            
            if (isModelLocal) {
                Text("Status: Ready (Local)", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodyMedium)
            } else {
                Text("Status: Not downloaded", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
                Spacer(modifier = Modifier.height(8.dp))
                
                when (val state = downloadState) {
                    is DownloadState.Idle, is DownloadState.Error -> {
                        Button(
                            onClick = {
                                scope.launch {
                                    ModelDownloader.downloadModel(selectedModel.url, modelFile)
                                        .collectLatest { newState ->
                                            downloadState = newState
                                            if (newState is DownloadState.Success) {
                                                isModelLocal = true
                                                // Trigger a recomposition to update isModelLocal and reload the agent
                                                onModelChange(selectedModelIndex)
                                            }
                                        }
                                }
                            },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(if (state is DownloadState.Error) "Retry Download" else "Download Model")
                        }
                        if (state is DownloadState.Error) {
                            Text(state.message, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                    is DownloadState.Downloading -> {
                        LinearProgressIndicator(
                            progress = { state.progress },
                            modifier = Modifier.fillMaxWidth()
                        )
                        Text("${(state.progress * 100).toInt()}%", style = MaterialTheme.typography.bodySmall)
                    }
                    is DownloadState.Success -> {
                        Text("Download complete!", color = MaterialTheme.colorScheme.primary)
                    }
                }
            }
        }
    }
}

// --- Dummy Implementations for compilation ---
class DummyEmbeddingModel : EmbeddingModelWrapper {
    override suspend fun getEmbedding(text: String): FloatArray = FloatArray(384) { 0.1f }
}

class DummyLlmInference : LlmInferenceWrapper {
    override suspend fun generateResponse(prompt: String): String = "Dummy response"
}

data class ChatMessage(val role: String, val content: String)

fun parseConversationHistory(history: String): List<ChatMessage> {
    val messages = mutableListOf<ChatMessage>()
    val lines = history.split("\n")
    var currentRole = ""
    var currentContent = StringBuilder()

    for (line in lines) {
        if (line.startsWith("User: ")) {
            if (currentRole.isNotEmpty()) {
                messages.add(ChatMessage(currentRole, currentContent.toString().trimEnd()))
            }
            currentRole = "User"
            currentContent = StringBuilder(line.substringAfter("User: ") + "\n")
        } else if (line.startsWith("Assistant: ")) {
            if (currentRole.isNotEmpty()) {
                messages.add(ChatMessage(currentRole, currentContent.toString().trimEnd()))
            }
            currentRole = "Assistant"
            currentContent = StringBuilder(line.substringAfter("Assistant: ") + "\n")
        } else if (line.startsWith("Observation: ")) {
            if (currentRole.isNotEmpty()) {
                messages.add(ChatMessage(currentRole, currentContent.toString().trimEnd()))
            }
            currentRole = "Observation"
            currentContent = StringBuilder(line.substringAfter("Observation: ") + "\n")
        } else {
            currentContent.append(line).append("\n")
        }
    }
    if (currentRole.isNotEmpty()) {
        messages.add(ChatMessage(currentRole, currentContent.toString().trimEnd()))
    }
    return messages
}
