package com.example.agent

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.outlined.Chat
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.CloudDownload
import androidx.compose.material.icons.outlined.Error
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Layers
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.LockOpen
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.SmartToy
import androidx.compose.material.icons.outlined.Wifi
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.agent.core.AgentLoop
import com.example.agent.core.DownloadState
import com.example.agent.core.LiteRtLmInference
import com.example.agent.core.LlmInferenceWrapper
import com.example.agent.core.MediaPipeLlmInference
import com.example.agent.core.ModelDownloader
import com.example.agent.core.SkillManager
import com.example.agent.memory.EmbeddingModelWrapper
import com.example.agent.memory.LocalMemoryManager
import com.example.agent.service.InferenceHttpServer
import com.example.agent.tools.*
import com.example.agent.ui.ShizukuState
import com.example.agent.ui.checkShizukuState
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import dagger.hilt.android.AndroidEntryPoint
import rikka.shizuku.Shizuku
import java.io.File
import java.net.NetworkInterface

// ─── Navigation ───────────────────────────────────────────────────────────────

enum class Screen { CHAT, MODELS, SETTINGS }

// ─── Data models ──────────────────────────────────────────────────────────────

data class GemmaModel(
    val name: String,
    val url: String,
    val filename: String,
    val useGpu: Boolean = false,
    val maxTokens: Int = 1024,
    val fileSizeMb: Int = 0,
)

data class ChatEntry(val role: String, val content: String)

val AVAILABLE_MODELS = listOf(
    // Gemma 4 — LiteRT-LM (.litertlm) · litert-community/HuggingFace · Apache 2.0
    GemmaModel("Gemma 4 E2B (CPU)", "https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it.litertlm?download=true", "gemma4_e2b_it.litertlm", useGpu = false, maxTokens = 8192, fileSizeMb = 2580),
    GemmaModel("Gemma 4 E2B (GPU)", "https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it.litertlm?download=true", "gemma4_e2b_it.litertlm", useGpu = true,  maxTokens = 8192, fileSizeMb = 2580),
    GemmaModel("Gemma 4 E4B (CPU)", "https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm/resolve/main/gemma-4-E4B-it.litertlm?download=true", "gemma4_e4b_it.litertlm", useGpu = false, maxTokens = 8192, fileSizeMb = 3650),
    GemmaModel("Gemma 4 E4B (GPU)", "https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm/resolve/main/gemma-4-E4B-it.litertlm?download=true", "gemma4_e4b_it.litertlm", useGpu = true,  maxTokens = 8192, fileSizeMb = 3650),
    // Gemma 3 — MediaPipe tasks-genai (.task) · storage.googleapis.com · public
    GemmaModel("Gemma 3 1B (CPU)", "https://storage.googleapis.com/mediapipe-models/llm_inference/gemma3-1b-it-cpu-int4/float16/1/gemma3-1b-it-cpu-int4.task", "gemma3_1b_cpu.task", useGpu = false, maxTokens = 8192, fileSizeMb = 700),
    GemmaModel("Gemma 3 1B (GPU)", "https://storage.googleapis.com/mediapipe-models/llm_inference/gemma3-1b-it-gpu-int4/float16/1/gemma3-1b-it-gpu-int4.task", "gemma3_1b_gpu.task", useGpu = true,  maxTokens = 8192, fileSizeMb = 700),
    // Gemma 2B — formato legacy .bin
    GemmaModel("Gemma 2B (CPU int4)", "https://storage.googleapis.com/mediapipe-models/llm_inference/gemma_cpu/v3/gemma-2b-it-cpu-int4.bin", "gemma2b_cpu_int4.bin", useGpu = false, maxTokens = 1024, fileSizeMb = 1500),
    GemmaModel("Gemma 2B (GPU int4)", "https://storage.googleapis.com/mediapipe-models/llm_inference/gemma_gpu/v3/gemma-2b-it-gpu-int4.bin", "gemma2b_gpu_int4.bin", useGpu = true,  maxTokens = 1024, fileSizeMb = 1500),
)

// ─── MainActivity ─────────────────────────────────────────────────────────────

@AndroidEntryPoint
class MainActivity : ComponentActivity(), Shizuku.OnRequestPermissionResultListener {

    // ── Core deps ─────────────────────────────────────────────────────────────
    private lateinit var agentLoop: AgentLoop
    private lateinit var memoryManager: LocalMemoryManager
    private var currentEngine: LlmInferenceWrapper = DummyLlmInference()
    private var inferenceServer: InferenceHttpServer? = null

    // ── Compose state ─────────────────────────────────────────────────────────
    private var messages        by mutableStateOf<List<ChatEntry>>(emptyList())
    private var isRunning       by mutableStateOf(false)
    private var modelIndex      by mutableStateOf(0)
    private var shizukuState    by mutableStateOf(ShizukuState.UNAVAILABLE)
    private var hasStorage      by mutableStateOf(false)

    private val binderReceived = Shizuku.OnBinderReceivedListener { refreshShizuku() }
    private val binderDead     = Shizuku.OnBinderDeadListener     { shizukuState = ShizukuState.UNAVAILABLE }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        val prefs = getSharedPreferences("gemcode", Context.MODE_PRIVATE)
        modelIndex = (prefs.getInt("modelIndex", 0)).coerceIn(0, AVAILABLE_MODELS.lastIndex)
        shizukuState = runCatching { ShizukuState.valueOf(prefs.getString("shizuku", "") ?: "") }
            .getOrDefault(ShizukuState.UNAVAILABLE)
        hasStorage = checkStorage()

        Shizuku.addRequestPermissionResultListener(this)
        Shizuku.addBinderReceivedListener(binderReceived)
        Shizuku.addBinderDeadListener(binderDead)
        refreshShizuku()

        // Core dependencies
        memoryManager = LocalMemoryManager(applicationContext, DummyEmbeddingModel())

        val tools = buildTools()
        currentEngine = loadEngine(modelIndex)
        agentLoop = buildLoop(currentEngine, tools)
        startServer(currentEngine)

        lifecycleScope.launch {
            messages = parseHistory(memoryManager.getConversationState() ?: "")
        }

        setContent {
            GemcodeTheme {
                GemcodeApp(
                    messages        = messages,
                    isRunning       = isRunning,
                    modelIndex      = modelIndex,
                    shizukuState    = shizukuState,
                    hasStorage      = hasStorage,
                    serverPort      = InferenceHttpServer.DEFAULT_PORT,
                    onSend          = { prompt -> runAgent(prompt, tools) },
                    onSelectModel   = { idx -> selectModel(idx, tools) },
                    onRequestShizuku  = { Shizuku.requestPermission(100) },
                    onRequestStorage  = { requestStorage() },
                )
            }
        }
    }

    override fun onResume() {
        super.onResume()
        hasStorage = checkStorage()
        getSharedPreferences("gemcode", Context.MODE_PRIVATE)
            .edit().putBoolean("storage", hasStorage).apply()
    }

    override fun onDestroy() {
        super.onDestroy()
        inferenceServer?.stop()
        Shizuku.removeRequestPermissionResultListener(this)
        Shizuku.removeBinderReceivedListener(binderReceived)
        Shizuku.removeBinderDeadListener(binderDead)
    }

    override fun onRequestPermissionResult(requestCode: Int, grantResult: Int) {
        if (requestCode == 100) refreshShizuku()
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private fun buildTools(): List<Tool> {
        val skillManager = SkillManager(applicationContext)
        return listOf(
            FileSystemTool(),
            SettingsTool(),
            UIInteractTool(),
            SkillTool(skillManager),
            GoogleIntegrationTool(applicationContext),
            MCPTool(),
        )
    }

    private fun loadEngine(index: Int): LlmInferenceWrapper {
        val model = AVAILABLE_MODELS[index]
        val file  = File(applicationContext.filesDir, model.filename)
        return if (file.exists()) createEngine(applicationContext, file, model)
               else DummyLlmInference()
    }

    private fun buildLoop(engine: LlmInferenceWrapper, tools: List<Tool>) =
        AgentLoop(llmInference = engine, tools = tools, memoryManager = memoryManager)

    private fun selectModel(idx: Int, tools: List<Tool>) {
        modelIndex = idx
        getSharedPreferences("gemcode", Context.MODE_PRIVATE)
            .edit().putInt("modelIndex", idx).apply()
        val engine = loadEngine(idx)
        currentEngine = engine
        agentLoop = buildLoop(engine, tools)
        startServer(engine)
    }

    private fun startServer(engine: LlmInferenceWrapper) {
        inferenceServer?.stop()
        inferenceServer = InferenceHttpServer(InferenceHttpServer.DEFAULT_PORT, engine).also { it.start() }
    }

    private fun runAgent(prompt: String, tools: List<Tool>) {
        if (isRunning) return
        isRunning = true
        messages = messages + ChatEntry("User", prompt)
        lifecycleScope.launch(Dispatchers.IO) {
            agentLoop.run(prompt)
            val updated = parseHistory(memoryManager.getConversationState() ?: "")
            withContext(Dispatchers.Main) {
                messages = updated
                isRunning = false
            }
        }
    }

    private fun refreshShizuku() {
        shizukuState = checkShizukuState()
        getSharedPreferences("gemcode", Context.MODE_PRIVATE)
            .edit().putString("shizuku", shizukuState.name).apply()
    }

    private fun checkStorage(): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) Environment.isExternalStorageManager()
        else true

    private fun requestStorage() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && !Environment.isExternalStorageManager()) {
            startActivity(Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION)
                .apply { data = Uri.parse("package:$packageName") })
        }
    }
}

// ─── Theme ────────────────────────────────────────────────────────────────────

private val GemcodeDarkColors = darkColorScheme(
    primary          = Color(0xFFA8C7FA),   // Google Blue (dark mode)
    onPrimary        = Color(0xFF003063),
    primaryContainer = Color(0xFF004A97),
    onPrimaryContainer = Color(0xFFD6E3FF),
    secondary        = Color(0xFFC2C7CF),
    surface          = Color(0xFF111318),
    surfaceVariant   = Color(0xFF1C1F26),
    onSurface        = Color(0xFFE2E2E9),
    onSurfaceVariant = Color(0xFFC4C6CF),
    outline          = Color(0xFF44474E),
    background       = Color(0xFF111318),
    onBackground     = Color(0xFFE2E2E9),
)

@Composable
fun GemcodeTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = GemcodeDarkColors,
        typography  = Typography(),
        content     = content,
    )
}

// ─── Root Composable ──────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GemcodeApp(
    messages: List<ChatEntry>,
    isRunning: Boolean,
    modelIndex: Int,
    shizukuState: ShizukuState,
    hasStorage: Boolean,
    serverPort: Int,
    onSend: (String) -> Unit,
    onSelectModel: (Int) -> Unit,
    onRequestShizuku: () -> Unit,
    onRequestStorage: () -> Unit,
) {
    var screen by remember { mutableStateOf(Screen.CHAT) }
    val activeModel = AVAILABLE_MODELS[modelIndex]

    Scaffold(
        contentWindowInsets = WindowInsets.safeDrawing,
        bottomBar = {
            GemcodeNavBar(current = screen, onNavigate = { screen = it })
        }
    ) { innerPadding ->
        AnimatedContent(
            targetState = screen,
            transitionSpec = { fadeIn() togetherWith fadeOut() },
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
            label = "screen",
        ) { target ->
            when (target) {
                Screen.CHAT     -> ChatScreen(
                    messages    = messages,
                    isRunning   = isRunning,
                    activeModel = activeModel,
                    onSend      = onSend,
                )
                Screen.MODELS   -> ModelsScreen(
                    modelIndex      = modelIndex,
                    onSelectModel   = onSelectModel,
                )
                Screen.SETTINGS -> SettingsScreen(
                    shizukuState      = shizukuState,
                    hasStorage        = hasStorage,
                    activeModel       = activeModel,
                    serverPort        = serverPort,
                    onRequestShizuku  = onRequestShizuku,
                    onRequestStorage  = onRequestStorage,
                )
            }
        }
    }
}

// ─── Navigation Bar ───────────────────────────────────────────────────────────

@Composable
fun GemcodeNavBar(current: Screen, onNavigate: (Screen) -> Unit) {
    NavigationBar(containerColor = MaterialTheme.colorScheme.surfaceVariant) {
        NavItem(Screen.CHAT,     "Chat",       Icons.Outlined.Chat,         current, onNavigate)
        NavItem(Screen.MODELS,   "Modelli",    Icons.Outlined.Layers,       current, onNavigate)
        NavItem(Screen.SETTINGS, "Impostazioni", Icons.Outlined.Settings,   current, onNavigate)
    }
}

@Composable
private fun RowScope.NavItem(
    screen: Screen, label: String, icon: ImageVector,
    current: Screen, onNavigate: (Screen) -> Unit,
) {
    NavigationBarItem(
        selected  = current == screen,
        onClick   = { onNavigate(screen) },
        icon      = { Icon(icon, contentDescription = label) },
        label     = { Text(label, fontSize = 11.sp) },
    )
}

// ─── Chat Screen ──────────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    messages: List<ChatEntry>,
    isRunning: Boolean,
    activeModel: GemmaModel,
    onSend: (String) -> Unit,
) {
    var input by remember { mutableStateOf("") }
    val listState = rememberLazyListState()

    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) listState.animateScrollToItem(messages.lastIndex)
    }

    Column(Modifier.fillMaxSize()) {
        // Top bar
        TopAppBar(
            title = {
                Column {
                    Text("GemCode Agent", fontWeight = FontWeight.SemiBold, fontSize = 18.sp)
                    Text(
                        text = activeModel.name,
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.primary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            },
            colors = TopAppBarDefaults.topAppBarColors(
                containerColor = MaterialTheme.colorScheme.surface,
            ),
        )

        HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.3f))

        // Messages
        if (messages.isEmpty()) {
            ChatWelcome(Modifier.weight(1f))
        } else {
            LazyColumn(
                state = listState,
                modifier = Modifier.weight(1f).fillMaxWidth(),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(messages) { entry -> ChatBubble(entry) }
                if (isRunning) {
                    item { TypingIndicator() }
                }
            }
        }

        // Input bar
        Surface(
            tonalElevation = 3.dp,
            color = MaterialTheme.colorScheme.surfaceVariant,
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .imePadding()
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                verticalAlignment = Alignment.Bottom,
            ) {
                TextField(
                    value = input,
                    onValueChange = { input = it },
                    modifier = Modifier.weight(1f),
                    placeholder = { Text("Scrivi un messaggio…", fontSize = 14.sp) },
                    enabled = !isRunning,
                    shape = RoundedCornerShape(24.dp),
                    colors = TextFieldDefaults.colors(
                        focusedContainerColor   = MaterialTheme.colorScheme.surface,
                        unfocusedContainerColor = MaterialTheme.colorScheme.surface,
                        focusedIndicatorColor   = Color.Transparent,
                        unfocusedIndicatorColor = Color.Transparent,
                        disabledIndicatorColor  = Color.Transparent,
                    ),
                    maxLines = 5,
                )
                Spacer(Modifier.width(8.dp))
                FilledIconButton(
                    onClick = {
                        if (input.isNotBlank()) {
                            onSend(input.trim())
                            input = ""
                        }
                    },
                    enabled = input.isNotBlank() && !isRunning,
                    modifier = Modifier.size(48.dp),
                ) {
                    Icon(
                        if (isRunning) Icons.Filled.Stop else Icons.Filled.Send,
                        contentDescription = if (isRunning) "Elaborazione…" else "Invia",
                        modifier = Modifier.size(20.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun ChatWelcome(modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(32.dp)) {
            Box(
                Modifier
                    .size(72.dp)
                    .clip(CircleShape)
                    .background(
                        Brush.linearGradient(listOf(
                            MaterialTheme.colorScheme.primary,
                            MaterialTheme.colorScheme.primaryContainer,
                        ))
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Outlined.SmartToy, "Agent", Modifier.size(36.dp),
                    tint = MaterialTheme.colorScheme.onPrimary)
            }
            Spacer(Modifier.height(20.dp))
            Text("Ciao, come posso aiutarti?",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))
            Text("Inferenza locale · Nessun dato al cloud",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun ChatBubble(entry: ChatEntry) {
    val isUser = entry.role.equals("User", ignoreCase = true)
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start,
    ) {
        if (!isUser) {
            Box(
                Modifier
                    .size(32.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.primaryContainer),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Outlined.SmartToy, "Agent", Modifier.size(18.dp),
                    tint = MaterialTheme.colorScheme.onPrimaryContainer)
            }
            Spacer(Modifier.width(8.dp))
        }
        Surface(
            shape = RoundedCornerShape(
                topStart = 20.dp, topEnd = 20.dp,
                bottomStart = if (isUser) 20.dp else 4.dp,
                bottomEnd   = if (isUser) 4.dp  else 20.dp,
            ),
            color = if (isUser) MaterialTheme.colorScheme.primaryContainer
                    else MaterialTheme.colorScheme.surfaceVariant,
            modifier = Modifier.widthIn(max = 300.dp),
        ) {
            Text(
                text = entry.content,
                modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                style = MaterialTheme.typography.bodyMedium,
                color = if (isUser) MaterialTheme.colorScheme.onPrimaryContainer
                        else MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun TypingIndicator() {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            Modifier.size(32.dp).clip(CircleShape)
                .background(MaterialTheme.colorScheme.primaryContainer),
            contentAlignment = Alignment.Center,
        ) {
            CircularProgressIndicator(
                Modifier.size(16.dp),
                color = MaterialTheme.colorScheme.onPrimaryContainer,
                strokeWidth = 2.dp,
            )
        }
        Spacer(Modifier.width(8.dp))
        Surface(
            shape = RoundedCornerShape(20.dp, 20.dp, 20.dp, 4.dp),
            color = MaterialTheme.colorScheme.surfaceVariant,
        ) {
            Text("Elaborazione…", Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

// ─── Models Screen ────────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ModelsScreen(modelIndex: Int, onSelectModel: (Int) -> Unit) {
    val context = LocalContext.current
    val scope   = rememberCoroutineScope()
    val downloadStates = remember { mutableStateMapOf<Int, DownloadState>() }

    Column(Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text("Modelli", fontWeight = FontWeight.SemiBold) },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface),
        )
        HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.3f))

        LazyColumn(
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            AVAILABLE_MODELS.forEachIndexed { idx, model ->
                item(key = idx) {
                    val file     = File(context.filesDir, model.filename)
                    val isLocal  by produceState(file.exists(), idx) { value = file.exists() }
                    val isActive = idx == modelIndex
                    val state    = downloadStates[idx]

                    ModelCard(
                        model    = model,
                        isLocal  = isLocal,
                        isActive = isActive,
                        dlState  = state,
                        onActivate = { onSelectModel(idx) },
                        onDownload = {
                            scope.launch {
                                ModelDownloader.downloadModel(model.url, file).collectLatest { s ->
                                    downloadStates[idx] = s
                                    if (s is DownloadState.Success) onSelectModel(idx)
                                }
                            }
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun ModelCard(
    model: GemmaModel,
    isLocal: Boolean,
    isActive: Boolean,
    dlState: DownloadState?,
    onActivate: () -> Unit,
    onDownload: () -> Unit,
) {
    val borderColor = when {
        isActive -> MaterialTheme.colorScheme.primary
        else     -> MaterialTheme.colorScheme.outline.copy(alpha = 0.3f)
    }
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = if (isActive) MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.2f)
                else MaterialTheme.colorScheme.surfaceVariant,
        modifier = Modifier.fillMaxWidth(),
        border = androidx.compose.foundation.BorderStroke(
            width = if (isActive) 1.5.dp else 1.dp, color = borderColor),
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(model.name, fontWeight = FontWeight.SemiBold,
                        style = MaterialTheme.typography.titleSmall)
                    Text("${model.fileSizeMb} MB · max ${model.maxTokens} token · " +
                            if (model.useGpu) "GPU" else "CPU",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                if (isActive) {
                    SuggestionChip(
                        onClick = {},
                        label = { Text("Attivo", fontSize = 11.sp) },
                        colors = SuggestionChipDefaults.suggestionChipColors(
                            containerColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.15f),
                            labelColor     = MaterialTheme.colorScheme.primary,
                        ),
                    )
                }
            }

            when {
                dlState is DownloadState.Downloading -> {
                    LinearProgressIndicator(
                        progress = { dlState.progress },
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Text("${(dlState.progress * 100).toInt()}%",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                dlState is DownloadState.Error -> {
                    Text("Errore: ${dlState.message}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error)
                    OutlinedButton(onClick = onDownload, modifier = Modifier.fillMaxWidth()) {
                        Icon(Icons.Outlined.CloudDownload, null, Modifier.size(16.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Riprova")
                    }
                }
                isLocal -> {
                    if (!isActive) {
                        Button(onClick = onActivate, modifier = Modifier.fillMaxWidth()) {
                            Text("Usa questo modello")
                        }
                    }
                }
                else -> {
                    OutlinedButton(onClick = onDownload, modifier = Modifier.fillMaxWidth()) {
                        Icon(Icons.Outlined.CloudDownload, null, Modifier.size(16.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Scarica (${model.fileSizeMb} MB)")
                    }
                }
            }
        }
    }
}

// ─── Settings Screen ──────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    shizukuState: ShizukuState,
    hasStorage: Boolean,
    activeModel: GemmaModel,
    serverPort: Int,
    onRequestShizuku: () -> Unit,
    onRequestStorage: () -> Unit,
) {
    Column(Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text("Impostazioni", fontWeight = FontWeight.SemiBold) },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface),
        )
        HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.3f))

        LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {

            // Server HTTP
            item {
                SettingsSection(title = "Server locale") {
                    val localIp = remember { getLocalIp() }
                    SettingsInfoRow(
                        icon  = Icons.Outlined.Wifi,
                        label = "Indirizzo web",
                        value = "http://$localIp:$serverPort",
                    )
                    SettingsInfoRow(
                        icon  = Icons.Outlined.Info,
                        label = "Il browser può chiamare Gemma 4 direttamente su questa porta. " +
                                "Imposta questo indirizzo nel frontend come host del backend.",
                        value = "",
                        isNote = true,
                    )
                }
            }

            // Permessi
            item {
                SettingsSection(title = "Permessi") {
                    PermissionRow(
                        label       = "Shizuku (SettingsTool)",
                        description = "Necessario per controllare le impostazioni di sistema via ADB",
                        granted     = shizukuState == ShizukuState.AUTHORIZED,
                        onRequest   = onRequestShizuku,
                    )
                    Spacer(Modifier.height(8.dp))
                    PermissionRow(
                        label       = "Storage completo (FileSystemTool)",
                        description = "Necessario per leggere e scrivere file ovunque nel dispositivo",
                        granted     = hasStorage,
                        onRequest   = onRequestStorage,
                    )
                }
            }

            // Modello attivo
            item {
                SettingsSection(title = "Modello attivo") {
                    SettingsInfoRow(Icons.Outlined.SmartToy, "Modello", activeModel.name)
                    SettingsInfoRow(Icons.Outlined.Info, "Formato",
                        if (activeModel.filename.endsWith(".litertlm")) "LiteRT-LM" else "MediaPipe")
                    SettingsInfoRow(Icons.Outlined.Info, "Backend",
                        if (activeModel.useGpu) "GPU (fallback CPU)" else "CPU")
                }
            }

            // Info app
            item {
                SettingsSection(title = "Info") {
                    SettingsInfoRow(Icons.Outlined.Info, "Versione app", "1.0.0")
                    SettingsInfoRow(Icons.Outlined.Info, "LiteRT-LM", "0.10.0")
                    SettingsInfoRow(Icons.Outlined.Info, "MediaPipe GenAI", "0.10.22")
                    SettingsInfoRow(Icons.Outlined.Info, "Cloud API", "Nessuna")
                }
            }
        }
    }
}

@Composable
private fun SettingsSection(title: String, content: @Composable ColumnScope.() -> Unit) {
    Column {
        Text(title.uppercase(), style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.padding(bottom = 8.dp))
        Surface(
            shape = RoundedCornerShape(16.dp),
            color = MaterialTheme.colorScheme.surfaceVariant,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(Modifier.padding(4.dp), content = content)
        }
    }
}

@Composable
private fun SettingsInfoRow(
    icon: ImageVector, label: String, value: String, isNote: Boolean = false,
) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Icon(icon, null, Modifier.size(18.dp).padding(top = 1.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(label, style = MaterialTheme.typography.bodyMedium,
                color = if (isNote) MaterialTheme.colorScheme.onSurfaceVariant
                        else MaterialTheme.colorScheme.onSurface)
            if (value.isNotBlank())
                Text(value, style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun PermissionRow(
    label: String, description: String, granted: Boolean, onRequest: () -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            if (granted) Icons.Outlined.LockOpen else Icons.Outlined.Lock,
            null, Modifier.size(20.dp),
            tint = if (granted) MaterialTheme.colorScheme.primary
                   else MaterialTheme.colorScheme.error,
        )
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(label, style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface)
            Text(description, style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (!granted) {
            Spacer(Modifier.width(8.dp))
            TextButton(onClick = onRequest) { Text("Concedi") }
        } else {
            Icon(Icons.Outlined.CheckCircle, "Granted",
                tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
        }
    }
}

// ─── Utils ────────────────────────────────────────────────────────────────────

fun createEngine(context: Context, file: File, model: GemmaModel): LlmInferenceWrapper =
    if (file.name.endsWith(".litertlm"))
        LiteRtLmInference(context, file.absolutePath, model.useGpu)
    else
        MediaPipeLlmInference(context, file.absolutePath, model.useGpu, model.maxTokens)

fun parseHistory(raw: String): List<ChatEntry> {
    val result  = mutableListOf<ChatEntry>()
    var role    = ""
    val buf     = StringBuilder()
    for (line in raw.split("\n")) {
        when {
            line.startsWith("User: ")       -> { if (role.isNotEmpty()) result += ChatEntry(role, buf.trimEnd().toString()); role = "User";      buf.clear(); buf.append(line.removePrefix("User: "))       }
            line.startsWith("Assistant: ")  -> { if (role.isNotEmpty()) result += ChatEntry(role, buf.trimEnd().toString()); role = "Assistant"; buf.clear(); buf.append(line.removePrefix("Assistant: "))  }
            line.startsWith("Observation: ")-> { if (role.isNotEmpty()) result += ChatEntry(role, buf.trimEnd().toString()); role = "Observation";buf.clear(); buf.append(line.removePrefix("Observation: "))}
            else -> buf.append('\n').append(line)
        }
    }
    if (role.isNotEmpty() && buf.isNotBlank()) result += ChatEntry(role, buf.trimEnd().toString())
    return result
}

private fun getLocalIp(): String = runCatching {
    NetworkInterface.getNetworkInterfaces().toList()
        .flatMap { it.inetAddresses.toList() }
        .firstOrNull { !it.isLoopbackAddress && it.hostAddress?.contains('.') == true }
        ?.hostAddress ?: "localhost"
}.getOrDefault("localhost")

// ─── Dummy implementations ────────────────────────────────────────────────────

class DummyLlmInference : LlmInferenceWrapper {
    override suspend fun generateResponse(prompt: String) =
        "Nessun modello caricato. Vai in Modelli e scarica un modello Gemma."
}

class DummyEmbeddingModel : EmbeddingModelWrapper {
    override suspend fun getEmbedding(text: String) = FloatArray(384) { 0.1f }
}
