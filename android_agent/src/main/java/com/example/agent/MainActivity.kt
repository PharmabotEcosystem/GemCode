package com.example.agent

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.Settings
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import com.example.agent.core.Skill
import com.example.agent.core.SkillManager
import com.example.agent.memory.EmbeddingModelWrapper
import com.example.agent.memory.LocalMemoryManager
import com.example.agent.service.InferenceHttpServer
import com.example.agent.tools.*
import com.example.agent.ui.ShizukuState
import com.example.agent.ui.checkShizukuState
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import dagger.hilt.android.AndroidEntryPoint
import rikka.shizuku.Shizuku
import java.io.File
import java.net.NetworkInterface
import android.Manifest
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.pm.PackageManager
import android.provider.OpenableColumns
import android.view.accessibility.AccessibilityManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.outlined.AttachFile
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Extension
import androidx.compose.material.icons.outlined.Mic
import androidx.compose.material.icons.outlined.MicOff
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Podcasts
import androidx.compose.material.icons.outlined.VolumeUp
import androidx.compose.ui.text.style.TextAlign
import androidx.core.content.ContextCompat
import kotlinx.serialization.json.*
import java.util.Locale

import androidx.activity.viewModels
import com.example.agent.orchestrator.AgentViewModel
import com.example.agent.orchestrator.ChatRole
import com.example.agent.orchestrator.ChatEntry
import com.example.agent.mvi.AgentState
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.lerp
import kotlin.math.roundToInt
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.sin

// ─── Navigation ───────────────────────────────────────────────────────────────

enum class Screen { CHAT, LIVE, MODELS, SKILLS, PLUGINS, SETTINGS }

private enum class LiveVoiceMode {
    IDLE,
    LISTENING,
    THINKING,
    SPEAKING,
    ERROR,
}



// ModelBackend, GemmaModel and AVAILABLE_MODELS are defined in GemmaModels.kt

private fun expectedMinModelBytes(fileSizeMb: Int): Long {
    if (fileSizeMb <= 0) return 1L
    val expected = fileSizeMb.toLong() * 1024L * 1024L
    // Keep tolerance for approximate catalog size values while rejecting partial downloads.
    return (expected * 8L) / 10L
}

private fun isValidModelFile(file: File, fileSizeMb: Int): Boolean {
    if (!file.exists()) return false
    return file.length() >= expectedMinModelBytes(fileSizeMb)
}

private fun formatBytesToMb(bytes: Long): String {
    val mb = bytes.toDouble() / (1024.0 * 1024.0)
    return "${(mb * 10.0).roundToInt() / 10.0} MB"
}

// ─── McpServer / Plugin Management ───────────────────────────────────────────

data class McpServer(
    val id: String = java.util.UUID.randomUUID().toString(),
    val name: String,
    val url: String,
    val enabled: Boolean = true,
)

private fun List<McpServer>.toMcpJson(): String = buildJsonArray {
    forEach { s ->
        add(buildJsonObject {
            put("id", s.id); put("name", s.name); put("url", s.url); put("enabled", s.enabled)
        })
    }
}.toString()

private fun String.parseMcpServers(): List<McpServer> = try {
    Json.parseToJsonElement(this).jsonArray.map {
        McpServer(
            id      = it.jsonObject["id"]?.jsonPrimitive?.content ?: java.util.UUID.randomUUID().toString(),
            name    = it.jsonObject["name"]?.jsonPrimitive?.content ?: "",
            url     = it.jsonObject["url"]?.jsonPrimitive?.content ?: "",
            enabled = it.jsonObject["enabled"]?.jsonPrimitive?.boolean ?: true,
        )
    }
} catch (_: Exception) { emptyList() }

// ─── MainActivity ─────────────────────────────────────────────────────────────

@AndroidEntryPoint
class MainActivity : ComponentActivity(), Shizuku.OnRequestPermissionResultListener {

    private val viewModel: AgentViewModel by viewModels()

    // ── Compose state ─────────────────────────────────────────────────────────
    private var modelIndex       by mutableStateOf(0)
    private var lmStudioUrl      by mutableStateOf("http://192.168.1.100:1234")
    private var ollamaUrl        by mutableStateOf("http://localhost:11434")
    private var ollamaModel      by mutableStateOf("gemma4:2b-instruct-q4_0")
    private var shizukuState     by mutableStateOf(ShizukuState.UNAVAILABLE)
    private var hasStorage       by mutableStateOf(false)
    private var hasCamera        by mutableStateOf(false)
    private var hasMicrophone    by mutableStateOf(false)
    private var hasCalendar      by mutableStateOf(false)
    private var hasContacts      by mutableStateOf(false)
    private var hasAccessibility by mutableStateOf(false)
    private var mcpServers       by mutableStateOf<List<McpServer>>(emptyList())
    private val skillManager     by lazy { SkillManager(this) }
    private var skills           by mutableStateOf<List<Skill>>(emptyList())
    private lateinit var permissionLauncher: ActivityResultLauncher<Array<String>>

    private val binderReceived = Shizuku.OnBinderReceivedListener { refreshShizuku() }
    private val binderDead     = Shizuku.OnBinderDeadListener     { shizukuState = ShizukuState.UNAVAILABLE }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        val prefs = getSharedPreferences("gemcode", Context.MODE_PRIVATE)
        modelIndex   = (prefs.getInt("modelIndex", 0)).coerceIn(0, AVAILABLE_MODELS.lastIndex)
        lmStudioUrl  = prefs.getString("lmStudioUrl", "http://192.168.1.100:1234") ?: "http://192.168.1.100:1234"
        ollamaUrl    = prefs.getString("ollamaUrl", "http://localhost:11434")        ?: "http://localhost:11434"
        ollamaModel  = prefs.getString("ollamaModel", "gemma4:2b-instruct-q4_0")    ?: "gemma4:2b-instruct-q4_0"
        shizukuState = runCatching { ShizukuState.valueOf(prefs.getString("shizuku", "") ?: "") }
            .getOrDefault(ShizukuState.UNAVAILABLE)
        hasStorage       = checkStorage()
        hasCamera        = checkRuntimePermission(Manifest.permission.CAMERA)
        hasMicrophone    = checkRuntimePermission(Manifest.permission.RECORD_AUDIO)
        hasCalendar      = checkRuntimePermission(Manifest.permission.READ_CALENDAR)
        hasContacts      = checkRuntimePermission(Manifest.permission.READ_CONTACTS)
        hasAccessibility = checkAccessibility()
        mcpServers       = (prefs.getString("mcpServers", "[]") ?: "[]").parseMcpServers()
        skills           = skillManager.getAllSkills()
        permissionLauncher = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
            if (result[Manifest.permission.CAMERA]        == true) hasCamera   = true
            if (result[Manifest.permission.RECORD_AUDIO]  == true) hasMicrophone = true
            if (result[Manifest.permission.READ_CALENDAR] == true) hasCalendar = true
            if (result[Manifest.permission.READ_CONTACTS] == true) hasContacts = true
        }

        // Auto-initialize selected model
        val currentModel = AVAILABLE_MODELS[modelIndex]
        when (currentModel.backend) {
            ModelBackend.LM_STUDIO ->
                viewModel.initializeModel("lmstudio://$lmStudioUrl", false)
            ModelBackend.OLLAMA ->
                viewModel.initializeModel("ollama://$ollamaUrl|$ollamaModel", false)
            else -> {
                val modelFile = File(filesDir, currentModel.filename)
                if (isValidModelFile(modelFile, currentModel.fileSizeMb)) {
                    viewModel.initializeModel(modelFile.absolutePath, currentModel.useGpu)
                }
            }
        }

        Shizuku.addRequestPermissionResultListener(this)
        Shizuku.addBinderReceivedListener(binderReceived)
        Shizuku.addBinderDeadListener(binderDead)
        refreshShizuku()

        setContent {
            val agentState by viewModel.state.collectAsState()
            val history by viewModel.conversationHistory.collectAsState()

            GemcodeTheme {
                GemcodeApp(
                    messages          = history,
                    agentState        = agentState,
                    modelIndex        = modelIndex,
                    lmStudioUrl       = lmStudioUrl,
                    ollamaUrl         = ollamaUrl,
                    ollamaModel       = ollamaModel,
                    shizukuState      = shizukuState,
                    hasStorage        = hasStorage,
                    hasCamera         = hasCamera,
                    hasMicrophone     = hasMicrophone,
                    hasCalendar       = hasCalendar,
                    hasContacts       = hasContacts,
                    hasAccessibility  = hasAccessibility,
                    mcpServers        = mcpServers,
                    onSend            = { prompt -> viewModel.sendPrompt(prompt) },
                    onCancel          = { viewModel.cancelInference() },
                    onSelectModel     = { idx -> selectModel(idx) },
                    onLmStudioUrlChange = { url -> saveLmStudioUrl(url) },
                    onOllamaConfigChange = { url, mdl -> saveOllamaConfig(url, mdl) },
                    onRequestShizuku     = { runCatching { Shizuku.requestPermission(100) } },
                    onRequestStorage     = { requestStorage() },
                    onRequestCamera      = { permissionLauncher.launch(arrayOf(Manifest.permission.CAMERA)) },
                    onRequestMicrophone  = { permissionLauncher.launch(arrayOf(Manifest.permission.RECORD_AUDIO)) },
                    onRequestCalendar    = { permissionLauncher.launch(arrayOf(Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR)) },
                    onRequestContacts    = { permissionLauncher.launch(arrayOf(Manifest.permission.READ_CONTACTS)) },
                    onRequestAccessibility = { startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) },
                    onAddMcpServer    = { srv -> mcpServers = mcpServers + srv; saveMcpServers() },
                    onDeleteMcpServer = { id -> mcpServers = mcpServers.filter { it.id != id }; saveMcpServers() },
                    onToggleMcpServer = { id -> mcpServers = mcpServers.map { if (it.id == id) it.copy(enabled = !it.enabled) else it }; saveMcpServers() },
                    skills         = skills,
                    onToggleSkill  = { id, enabled ->
                        lifecycleScope.launch(Dispatchers.IO) {
                            skillManager.setEnabled(id, enabled)
                            val loaded = skillManager.getAllSkills()
                            withContext(Dispatchers.Main) { skills = loaded }
                        }
                    },
                    onDeleteSkill  = { id ->
                        lifecycleScope.launch(Dispatchers.IO) {
                            skillManager.deleteSkill(id)
                            val loaded = skillManager.getAllSkills()
                            withContext(Dispatchers.Main) { skills = loaded }
                        }
                    },
                    onCreateSkill  = { name, desc, inst ->
                        lifecycleScope.launch(Dispatchers.IO) {
                            skillManager.upsertSkill(name, desc, inst, "user", emptyList())
                            val loaded = skillManager.getAllSkills()
                            withContext(Dispatchers.Main) { skills = loaded }
                        }
                    },
                )
            }
        }
    }

    override fun onResume() {
        super.onResume()
        hasStorage       = checkStorage()
        hasCamera        = checkRuntimePermission(Manifest.permission.CAMERA)
        hasMicrophone    = checkRuntimePermission(Manifest.permission.RECORD_AUDIO)
        hasCalendar      = checkRuntimePermission(Manifest.permission.READ_CALENDAR)
        hasContacts      = checkRuntimePermission(Manifest.permission.READ_CONTACTS)
        hasAccessibility = checkAccessibility()
        getSharedPreferences("gemcode", Context.MODE_PRIVATE)
            .edit().putBoolean("storage", hasStorage).apply()
        lifecycleScope.launch(Dispatchers.IO) {
            val loaded = skillManager.getAllSkills()
            withContext(Dispatchers.Main) { skills = loaded }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        Shizuku.removeRequestPermissionResultListener(this)
        Shizuku.removeBinderReceivedListener(binderReceived)
        Shizuku.removeBinderDeadListener(binderDead)
    }

    override fun onRequestPermissionResult(requestCode: Int, grantResult: Int) {
        if (requestCode == 100) refreshShizuku()
    }

    private fun selectModel(idx: Int) {
        modelIndex = idx
        getSharedPreferences("gemcode", Context.MODE_PRIVATE)
            .edit().putInt("modelIndex", idx).apply()
        val model = AVAILABLE_MODELS[idx]
        when (model.backend) {
            ModelBackend.LM_STUDIO ->
                viewModel.initializeModel("lmstudio://$lmStudioUrl", false)
            ModelBackend.OLLAMA ->
                viewModel.initializeModel("ollama://$ollamaUrl|$ollamaModel", false)
            else -> {
                val file = File(filesDir, model.filename)
                if (isValidModelFile(file, model.fileSizeMb)) {
                    viewModel.initializeModel(file.absolutePath, model.useGpu)
                }
            }
        }
    }

    private fun saveOllamaConfig(url: String, model: String) {
        ollamaUrl = url
        ollamaModel = model
        getSharedPreferences("gemcode", Context.MODE_PRIVATE).edit()
            .putString("ollamaUrl", url).putString("ollamaModel", model).apply()
        if (AVAILABLE_MODELS[modelIndex].backend == ModelBackend.OLLAMA) {
            viewModel.initializeModel("ollama://$url|$model", false)
        }
    }

    private fun saveLmStudioUrl(url: String) {
        lmStudioUrl = url
        getSharedPreferences("gemcode", Context.MODE_PRIVATE)
            .edit().putString("lmStudioUrl", url).apply()
        if (AVAILABLE_MODELS[modelIndex].backend == ModelBackend.LM_STUDIO) {
            viewModel.initializeModel("lmstudio://$url", false)
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

    private fun checkRuntimePermission(perm: String) =
        ContextCompat.checkSelfPermission(this, perm) == PackageManager.PERMISSION_GRANTED

    private fun checkAccessibility(): Boolean {
        val am = getSystemService(Context.ACCESSIBILITY_SERVICE) as AccessibilityManager
        return am.isEnabled && am.getEnabledAccessibilityServiceList(
            AccessibilityServiceInfo.FEEDBACK_ALL_MASK
        ).any { it.resolveInfo.serviceInfo.packageName == packageName }
    }

    private fun saveMcpServers() {
        getSharedPreferences("gemcode", Context.MODE_PRIVATE)
            .edit().putString("mcpServers", mcpServers.toMcpJson()).apply()
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
    agentState: AgentState,
    modelIndex: Int,
    lmStudioUrl: String,
    ollamaUrl: String,
    ollamaModel: String,
    shizukuState: ShizukuState,
    hasStorage: Boolean,
    hasCamera: Boolean,
    hasMicrophone: Boolean,
    hasCalendar: Boolean,
    hasContacts: Boolean,
    hasAccessibility: Boolean,
    mcpServers: List<McpServer>,
    onSend: (String) -> Unit,
    onCancel: () -> Unit,
    onSelectModel: (Int) -> Unit,
    onLmStudioUrlChange: (String) -> Unit,
    onOllamaConfigChange: (String, String) -> Unit,
    onRequestShizuku: () -> Unit,
    onRequestStorage: () -> Unit,
    onRequestCamera: () -> Unit,
    onRequestMicrophone: () -> Unit,
    onRequestCalendar: () -> Unit,
    onRequestContacts: () -> Unit,
    onRequestAccessibility: () -> Unit,
    onAddMcpServer: (McpServer) -> Unit,
    onDeleteMcpServer: (String) -> Unit,
    onToggleMcpServer: (String) -> Unit,
    skills: List<Skill>,
    onToggleSkill: (String, Boolean) -> Unit,
    onDeleteSkill: (String) -> Unit,
    onCreateSkill: (String, String, String) -> Unit,
) {
    var screen by remember { mutableStateOf(Screen.CHAT) }
    val activeModel = AVAILABLE_MODELS[modelIndex]
    val isBusy = agentState is AgentState.Reasoning || agentState is AgentState.ExecutingTool

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
                Screen.CHAT    -> ChatScreen(
                    messages    = messages,
                    isRunning   = isBusy,
                    activeModel = activeModel,
                    onSend      = onSend,
                )
                Screen.LIVE    -> GemmaLiveScreen(
                    messages        = messages,
                    isRunning       = isBusy,
                    activeModel     = activeModel,
                    hasMicrophone   = hasMicrophone,
                    onRequestMic    = onRequestMicrophone,
                    onSend          = onSend,
                    onCancel        = onCancel,
                )
                Screen.MODELS  -> ModelsScreen(
                    modelIndex    = modelIndex,
                    lmStudioUrl   = lmStudioUrl,
                    ollamaUrl     = ollamaUrl,
                    ollamaModel   = ollamaModel,
                    onSelectModel = onSelectModel,
                )
                Screen.SKILLS  -> SkillsScreen(
                    skills        = skills,
                    onToggleSkill = onToggleSkill,
                    onDeleteSkill = onDeleteSkill,
                    onCreateSkill = onCreateSkill,
                )
                Screen.PLUGINS -> PluginsScreen(
                    servers        = mcpServers,
                    onAddServer    = onAddMcpServer,
                    onDeleteServer = onDeleteMcpServer,
                    onToggleServer = onToggleMcpServer,
                )
                Screen.SETTINGS -> SettingsScreen(
                    shizukuState          = shizukuState,
                    hasStorage            = hasStorage,
                    hasCamera             = hasCamera,
                    hasMicrophone         = hasMicrophone,
                    hasCalendar           = hasCalendar,
                    hasContacts           = hasContacts,
                    hasAccessibility      = hasAccessibility,
                    activeModel           = activeModel,
                    serverPort            = InferenceHttpServer.DEFAULT_PORT,
                    lmStudioUrl           = lmStudioUrl,
                    onLmStudioUrlChange   = onLmStudioUrlChange,
                    ollamaUrl             = ollamaUrl,
                    ollamaModel           = ollamaModel,
                    onOllamaConfigChange  = onOllamaConfigChange,
                    onRequestShizuku      = onRequestShizuku,
                    onRequestStorage      = onRequestStorage,
                    onRequestCamera       = onRequestCamera,
                    onRequestMicrophone   = onRequestMicrophone,
                    onRequestCalendar     = onRequestCalendar,
                    onRequestContacts     = onRequestContacts,
                    onRequestAccessibility = onRequestAccessibility,
                )
            }
        }
    }
}

// ─── Navigation Bar ───────────────────────────────────────────────────────────

@Composable
fun GemcodeNavBar(current: Screen, onNavigate: (Screen) -> Unit) {
    NavigationBar(containerColor = MaterialTheme.colorScheme.surfaceVariant) {
        NavItem(Screen.CHAT,     "Chat",         Icons.Outlined.Chat,      current, onNavigate)
        NavItem(Screen.LIVE,     "Live",         Icons.Outlined.Podcasts,      current, onNavigate)
        NavItem(Screen.MODELS,   "Modelli",      Icons.Outlined.Layers,      current, onNavigate)
        NavItem(Screen.SKILLS,   "Skills",       Icons.Outlined.AutoAwesome, current, onNavigate)
        NavItem(Screen.PLUGINS,  "Plugin",       Icons.Outlined.Extension,   current, onNavigate)
        NavItem(Screen.SETTINGS, "Impostazioni", Icons.Outlined.Settings,  current, onNavigate)
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun GemmaLiveScreen(
    messages: List<ChatEntry>,
    isRunning: Boolean,
    activeModel: GemmaModel,
    hasMicrophone: Boolean,
    onRequestMic: () -> Unit,
    onSend: (String) -> Unit,
    onCancel: () -> Unit,
) {
    val context = LocalContext.current
    val speechRecognizerAvailable = remember { SpeechRecognizer.isRecognitionAvailable(context) }
    var liveMode by remember { mutableStateOf(LiveVoiceMode.IDLE) }
    var liveTranscript by remember { mutableStateOf("") }
    var liveStatus by remember { mutableStateOf("Tocca il microfono per parlare con Gemma 4 in tempo reale.") }
    var expectedAgentCount by remember { mutableStateOf(0) }
    var lastSpokenAgentReply by remember { mutableStateOf<String?>(null) }
    var ttsReady by remember { mutableStateOf(false) }

    val recognizerIntent = remember {
        Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "it-IT")
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, false)
        }
    }

    val tts = remember {
        TextToSpeech(context) { status ->
            ttsReady = status == TextToSpeech.SUCCESS
        }
    }

    val recognizer = remember(speechRecognizerAvailable) {
        if (speechRecognizerAvailable) SpeechRecognizer.createSpeechRecognizer(context) else null
    }

    DisposableEffect(tts) {
        tts.language = Locale.ITALIAN
        tts.setSpeechRate(0.96f)
        tts.setPitch(1.02f)
        tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) {
                liveMode = LiveVoiceMode.SPEAKING
                liveStatus = "Gemma sta parlando"
            }

            override fun onDone(utteranceId: String?) {
                liveMode = LiveVoiceMode.IDLE
                liveStatus = "Pronta per ascoltarti di nuovo"
            }

            @Deprecated("Deprecated in Java")
            override fun onError(utteranceId: String?) {
                liveMode = LiveVoiceMode.ERROR
                liveStatus = "La sintesi vocale Android non ha completato la risposta"
            }

            override fun onError(utteranceId: String?, errorCode: Int) {
                liveMode = LiveVoiceMode.ERROR
                liveStatus = "Errore TTS Android ($errorCode)"
            }
        })

        onDispose {
            tts.stop()
            tts.shutdown()
        }
    }

    DisposableEffect(recognizer) {
        recognizer?.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {
                liveMode = LiveVoiceMode.LISTENING
                liveStatus = "Ti ascolto"
            }

            override fun onBeginningOfSpeech() {
                liveMode = LiveVoiceMode.LISTENING
                liveStatus = "Parla liberamente"
            }

            override fun onRmsChanged(rmsdB: Float) = Unit
            override fun onBufferReceived(buffer: ByteArray?) = Unit

            override fun onEndOfSpeech() {
                liveMode = LiveVoiceMode.THINKING
                liveStatus = "Sto inviando la tua richiesta a Gemma"
            }

            @Deprecated("Deprecated in Android SpeechRecognizer")
            override fun onError(error: Int) {
                liveMode = when (error) {
                    SpeechRecognizer.ERROR_NO_MATCH,
                    SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> LiveVoiceMode.IDLE
                    else -> LiveVoiceMode.ERROR
                }
                liveStatus = when (error) {
                    SpeechRecognizer.ERROR_AUDIO -> "Errore audio del microfono"
                    SpeechRecognizer.ERROR_CLIENT -> "Sessione voce interrotta"
                    SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Permesso microfono mancante"
                    SpeechRecognizer.ERROR_NETWORK,
                    SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "Motore voce Android non raggiungibile"
                    SpeechRecognizer.ERROR_NO_MATCH -> "Non ho capito, riprova"
                    SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "Il riconoscimento vocale e gia occupato"
                    SpeechRecognizer.ERROR_SERVER -> "Servizio voce Android in errore"
                    SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "Nessuna voce rilevata"
                    else -> "Errore voce Android ($error)"
                }
                if (liveMode == LiveVoiceMode.IDLE) {
                    liveTranscript = ""
                }
            }

            override fun onResults(results: Bundle?) {
                val text = results
                    ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    ?.firstOrNull()
                    ?.trim()
                    .orEmpty()

                if (text.isBlank()) {
                    liveMode = LiveVoiceMode.IDLE
                    liveStatus = "Non ho ricevuto una frase valida"
                    return
                }

                liveTranscript = text
                expectedAgentCount = messages.count { it.role == ChatRole.Agent } + 1
                lastSpokenAgentReply = null
                liveMode = LiveVoiceMode.THINKING
                liveStatus = "Gemma sta ragionando sulla tua richiesta"
                onSend(text)
            }

            override fun onPartialResults(partialResults: Bundle?) {
                val partial = partialResults
                    ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    ?.firstOrNull()
                    ?.trim()
                    .orEmpty()
                if (partial.isNotBlank()) {
                    liveTranscript = partial
                    liveMode = LiveVoiceMode.LISTENING
                }
            }

            override fun onEvent(eventType: Int, params: Bundle?) = Unit
        })

        onDispose {
            recognizer?.cancel()
            recognizer?.destroy()
        }
    }

    val agentReplies = remember(messages) {
        messages.filter { it.role == ChatRole.Agent }
    }

    LaunchedEffect(agentReplies.size, isRunning, ttsReady, liveMode) {
        if (expectedAgentCount == 0) return@LaunchedEffect
        if (agentReplies.size < expectedAgentCount) return@LaunchedEffect
        if (isRunning) return@LaunchedEffect

        val reply = agentReplies.lastOrNull()?.content?.trim().orEmpty()
        if (reply.isBlank() || reply == lastSpokenAgentReply) return@LaunchedEffect

        lastSpokenAgentReply = reply
        expectedAgentCount = 0
        if (ttsReady) {
            liveStatus = "Risposta pronta"
            tts.speak(reply, TextToSpeech.QUEUE_FLUSH, null, "gemma-live-${System.currentTimeMillis()}")
        } else {
            liveMode = LiveVoiceMode.IDLE
            liveStatus = "Risposta pronta, ma TTS Android non disponibile"
        }
    }

    val latestReply = agentReplies.lastOrNull()?.content.orEmpty()

    val actionLabel = when {
        !hasMicrophone -> "Concedi microfono"
        !speechRecognizerAvailable -> "Voce Android non disponibile"
        liveMode == LiveVoiceMode.LISTENING -> "Ferma ascolto"
        liveMode == LiveVoiceMode.THINKING -> "Annulla richiesta"
        liveMode == LiveVoiceMode.SPEAKING -> "Ferma voce"
        else -> "Parla con Gemma"
    }

    fun startListening() {
        if (!hasMicrophone) {
            onRequestMic()
            return
        }
        if (!speechRecognizerAvailable || recognizer == null) {
            liveMode = LiveVoiceMode.ERROR
            liveStatus = "Questo dispositivo non espone SpeechRecognizer"
            return
        }
        tts.stop()
        liveTranscript = ""
        liveMode = LiveVoiceMode.LISTENING
        liveStatus = "Attivo il microfono"
        recognizer.cancel()
        recognizer.startListening(recognizerIntent)
    }

    fun stopCurrentAction() {
        when (liveMode) {
            LiveVoiceMode.LISTENING -> {
                recognizer?.stopListening()
                liveMode = LiveVoiceMode.THINKING
                liveStatus = "Invio la tua frase a Gemma"
            }
            LiveVoiceMode.THINKING -> {
                onCancel()
                expectedAgentCount = 0
                liveMode = LiveVoiceMode.IDLE
                liveStatus = "Richiesta interrotta"
            }
            LiveVoiceMode.SPEAKING -> {
                tts.stop()
                liveMode = LiveVoiceMode.IDLE
                liveStatus = "Voce fermata"
            }
            LiveVoiceMode.ERROR,
            LiveVoiceMode.IDLE -> {
                liveMode = LiveVoiceMode.IDLE
            }
        }
    }

    Column(Modifier.fillMaxSize()) {
        TopAppBar(
            title = {
                Column {
                    Text("Gemma Live", fontWeight = FontWeight.SemiBold, fontSize = 18.sp)
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

        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        listOf(
                            MaterialTheme.colorScheme.surface,
                            MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.92f),
                            MaterialTheme.colorScheme.background,
                        )
                    )
                )
                .padding(horizontal = 20.dp, vertical = 16.dp)
        ) {
            Column(
                modifier = Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.SpaceBetween,
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Surface(
                        shape = RoundedCornerShape(28.dp),
                        color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.18f),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Column(Modifier.padding(horizontal = 18.dp, vertical = 14.dp)) {
                            Text(
                                "Conversazione vocale locale",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Spacer(Modifier.height(6.dp))
                            Text(
                                "Microfono Android per la tua voce, Gemma 4 per la risposta, uscita letta con TTS locale del telefono.",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }

                    LiveWavePanel(mode = liveMode)

                    StatusCard(
                        title = when (liveMode) {
                            LiveVoiceMode.LISTENING -> "Ascolto attivo"
                            LiveVoiceMode.THINKING -> "Gemma sta ragionando"
                            LiveVoiceMode.SPEAKING -> "Risposta vocale in uscita"
                            LiveVoiceMode.ERROR -> "Serve attenzione"
                            LiveVoiceMode.IDLE -> "Pronta"
                        },
                        text = liveStatus,
                    )
                }

                Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    if (liveTranscript.isNotBlank()) {
                        LiveTranscriptCard(
                            title = "Ultima frase captata",
                            text = liveTranscript,
                        )
                    }

                    if (latestReply.isNotBlank()) {
                        LiveTranscriptCard(
                            title = "Ultima risposta di Gemma",
                            text = latestReply,
                        )
                    }

                    FilledTonalButton(
                        onClick = {
                            when (liveMode) {
                                LiveVoiceMode.IDLE,
                                LiveVoiceMode.ERROR -> startListening()
                                LiveVoiceMode.LISTENING,
                                LiveVoiceMode.THINKING,
                                LiveVoiceMode.SPEAKING -> stopCurrentAction()
                            }
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(72.dp),
                        shape = RoundedCornerShape(28.dp),
                        colors = ButtonDefaults.filledTonalButtonColors(
                            containerColor = if (liveMode == LiveVoiceMode.ERROR)
                                MaterialTheme.colorScheme.errorContainer
                            else
                                MaterialTheme.colorScheme.primaryContainer,
                            contentColor = if (liveMode == LiveVoiceMode.ERROR)
                                MaterialTheme.colorScheme.onErrorContainer
                            else
                                MaterialTheme.colorScheme.onPrimaryContainer,
                        ),
                            enabled = !hasMicrophone || speechRecognizerAvailable,
                    ) {
                        Icon(
                            imageVector = when (liveMode) {
                                LiveVoiceMode.LISTENING -> Icons.Outlined.MicOff
                                LiveVoiceMode.SPEAKING -> Icons.Outlined.VolumeUp
                                else -> Icons.Outlined.Mic
                            },
                            contentDescription = actionLabel,
                            modifier = Modifier.size(24.dp),
                        )
                        Spacer(Modifier.width(10.dp))
                        Text(actionLabel, style = MaterialTheme.typography.titleMedium)
                    }

                    if (!hasMicrophone) {
                        Text(
                            "Il permesso microfono e obbligatorio per attivare Gemma Live.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    } else if (!speechRecognizerAvailable) {
                        Text(
                            "Su questo dispositivo il riconoscimento vocale Android non risulta disponibile.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun LiveWavePanel(mode: LiveVoiceMode) {
    val infiniteTransition = rememberInfiniteTransition(label = "gemma-live")
    val pulse by infiniteTransition.animateFloat(
        initialValue = 0.86f,
        targetValue = 1.14f,
        animationSpec = infiniteRepeatable(
            animation = tween(
                durationMillis = when (mode) {
                    LiveVoiceMode.LISTENING -> 760
                    LiveVoiceMode.THINKING -> 1260
                    LiveVoiceMode.SPEAKING -> 640
                    LiveVoiceMode.ERROR -> 900
                    LiveVoiceMode.IDLE -> 1800
                },
                easing = FastOutSlowInEasing,
            ),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "live-pulse",
    )
    val phase by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = (PI * 2).toFloat(),
        animationSpec = infiniteRepeatable(
            animation = tween(
                durationMillis = when (mode) {
                    LiveVoiceMode.LISTENING -> 820
                    LiveVoiceMode.THINKING -> 1700
                    LiveVoiceMode.SPEAKING -> 540
                    LiveVoiceMode.ERROR -> 1000
                    LiveVoiceMode.IDLE -> 2200
                },
                easing = LinearEasing,
            ),
            repeatMode = RepeatMode.Restart,
        ),
        label = "live-phase",
    )

    val baseColor = when (mode) {
        LiveVoiceMode.LISTENING -> Color(0xFF6EE7FF)
        LiveVoiceMode.THINKING -> MaterialTheme.colorScheme.primary
        LiveVoiceMode.SPEAKING -> Color(0xFFA8FFB3)
        LiveVoiceMode.ERROR -> MaterialTheme.colorScheme.error
        LiveVoiceMode.IDLE -> MaterialTheme.colorScheme.onSurfaceVariant
    }

    Surface(
        shape = RoundedCornerShape(36.dp),
        color = Color.Transparent,
        modifier = Modifier
            .fillMaxWidth()
            .height(320.dp)
            .border(
                width = 1.dp,
                color = MaterialTheme.colorScheme.outline.copy(alpha = 0.2f),
                shape = RoundedCornerShape(36.dp),
            )
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.radialGradient(
                        colors = listOf(
                            baseColor.copy(alpha = 0.22f),
                            MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.92f),
                            MaterialTheme.colorScheme.surface.copy(alpha = 0.98f),
                        ),
                    )
                ),
            contentAlignment = Alignment.Center,
        ) {
            Box(
                modifier = Modifier
                    .size(224.dp)
                    .scale(pulse)
                    .alpha(if (mode == LiveVoiceMode.IDLE) 0.42f else 0.74f)
                    .clip(CircleShape)
                    .background(baseColor.copy(alpha = 0.16f))
            )
            Box(
                modifier = Modifier
                    .size(164.dp)
                    .scale(2f - pulse)
                    .alpha(if (mode == LiveVoiceMode.IDLE) 0.16f else 0.26f)
                    .clip(CircleShape)
                    .background(baseColor.copy(alpha = 0.24f))
            )
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(24.dp),
            ) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(7.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    repeat(17) { index ->
                        val shifted = phase + index * 0.42f
                        val normalized = ((sin(shifted) + 1f) / 2f)
                        val modeBoost = when (mode) {
                            LiveVoiceMode.LISTENING -> 1f
                            LiveVoiceMode.THINKING -> 0.56f
                            LiveVoiceMode.SPEAKING -> 1.18f
                            LiveVoiceMode.ERROR -> 0.82f
                            LiveVoiceMode.IDLE -> 0.28f
                        }
                        val barHeight by animateFloatAsState(
                            targetValue = 18f + normalized * 72f * modeBoost,
                            animationSpec = tween(180),
                            label = "wave-$index",
                        )
                        val barColor = lerp(
                            MaterialTheme.colorScheme.surfaceVariant,
                            baseColor,
                            0.35f + normalized * 0.6f,
                        )
                        Box(
                            modifier = Modifier
                                .width(8.dp)
                                .height(barHeight.dp)
                                .clip(RoundedCornerShape(99.dp))
                                .background(barColor)
                        )
                    }
                }

                Box(
                    modifier = Modifier
                        .size(92.dp)
                        .clip(CircleShape)
                        .background(baseColor.copy(alpha = 0.16f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = when (mode) {
                            LiveVoiceMode.LISTENING -> Icons.Outlined.Mic
                            LiveVoiceMode.THINKING -> Icons.Outlined.SmartToy
                            LiveVoiceMode.SPEAKING -> Icons.Outlined.VolumeUp
                            LiveVoiceMode.ERROR -> Icons.Outlined.Error
                            LiveVoiceMode.IDLE -> Icons.Outlined.Podcasts
                        },
                        contentDescription = null,
                        tint = baseColor,
                        modifier = Modifier.size(42.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun StatusCard(title: String, text: String) {
    Surface(
        shape = RoundedCornerShape(24.dp),
        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.82f),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(horizontal = 18.dp, vertical = 16.dp)) {
            Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(6.dp))
            Text(text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun LiveTranscriptCard(title: String, text: String) {
    Surface(
        shape = RoundedCornerShape(24.dp),
        color = MaterialTheme.colorScheme.surfaceVariant,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(horizontal = 18.dp, vertical = 14.dp)) {
            Text(title, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.height(6.dp))
            Text(text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface)
        }
    }
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
    var pendingAttachment by remember { mutableStateOf<Pair<String, String>?>(null) }
    val listState = rememberLazyListState()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val attachLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri ->
        if (uri != null) {
            scope.launch {
                val result = withContext(Dispatchers.IO) { readAttachment(context, uri) }
                pendingAttachment = result
            }
        }
    }

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
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .imePadding(),
            ) {
                // Attachment chip
                if (pendingAttachment != null) {
                    Row(
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        AssistChip(
                            onClick = {},
                            label = { Text(pendingAttachment!!.first, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                            leadingIcon = { Icon(Icons.Outlined.AttachFile, null, Modifier.size(16.dp)) },
                            trailingIcon = {
                                IconButton(onClick = { pendingAttachment = null }, modifier = Modifier.size(20.dp)) {
                                    Icon(Icons.Outlined.Close, "Rimuovi allegato", Modifier.size(14.dp))
                                }
                            },
                        )
                    }
                }
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.Bottom,
                ) {
                    IconButton(
                        onClick = { attachLauncher.launch("*/*") },
                        enabled = !isRunning,
                        modifier = Modifier.size(48.dp),
                    ) {
                        Icon(
                            Icons.Outlined.AttachFile, "Allega file",
                            tint = if (isRunning) MaterialTheme.colorScheme.outline
                                   else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Spacer(Modifier.width(4.dp))
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
                            val hasContent = input.isNotBlank() || pendingAttachment != null
                            if (hasContent) {
                                val fullMessage = buildString {
                                    pendingAttachment?.let { (name, content) ->
                                        append("[Allegato: $name]")
                                        if (content.isNotBlank()) { append("\n"); append(content) }
                                        if (input.isNotBlank()) append("\n\n")
                                    }
                                    append(input.trim())
                                }
                                onSend(fullMessage)
                                input = ""
                                pendingAttachment = null
                            }
                        },
                        enabled = (input.isNotBlank() || pendingAttachment != null) && !isRunning,
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
    val isUser = entry.role == ChatRole.User
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
fun ModelsScreen(modelIndex: Int, lmStudioUrl: String, ollamaUrl: String, ollamaModel: String, onSelectModel: (Int) -> Unit) {
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
                    val isServerModel = model.backend == ModelBackend.LM_STUDIO || model.backend == ModelBackend.OLLAMA
                    val file = remember(model.filename) { File(context.filesDir, model.filename) }
                    val state = downloadStates[idx]
                    val isLocal  = if (isServerModel) true
                                   else isValidModelFile(file, model.fileSizeMb)
                    val isActive = idx == modelIndex
                    val serverUrl = when (model.backend) {
                        ModelBackend.LM_STUDIO -> lmStudioUrl
                        ModelBackend.OLLAMA    -> "$ollamaUrl ($ollamaModel)"
                        else                   -> null
                    }

                    ModelCard(
                        model      = model,
                        isLocal    = isLocal,
                        isActive   = isActive,
                        dlState    = state,
                        serverUrl  = serverUrl,
                        onActivate = { onSelectModel(idx) },
                        onDownload = {
                            scope.launch {
                                ModelDownloader.downloadModel(
                                    urlStr = model.url,
                                    destFile = file,
                                    expectedMinBytes = expectedMinModelBytes(model.fileSizeMb),
                                ).collectLatest { s ->
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
    serverUrl: String?,
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
                    val subtitle = when (model.backend) {
                        ModelBackend.LM_STUDIO ->
                            "LM Studio · ${serverUrl ?: "non configurato"} · max ${model.maxTokens} token"
                        ModelBackend.OLLAMA ->
                            "Ollama Termux · ${serverUrl ?: "non configurato"} · max ${model.maxTokens} token"
                        else ->
                            "${model.fileSizeMb} MB · max ${model.maxTokens} token · " +
                                if (model.useGpu) "GPU" else "CPU"
                    }
                    Text(subtitle,
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
                    if (dlState.progress != null) {
                        LinearProgressIndicator(
                            progress = { dlState.progress },
                            modifier = Modifier.fillMaxWidth(),
                        )
                        Text(
                            "${(dlState.progress * 100).toInt()}% · ${formatBytesToMb(dlState.downloadedBytes)}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    } else {
                        LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                        Text(
                            "Scaricati ${formatBytesToMb(dlState.downloadedBytes)}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
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
                            Text(when (model.backend) {
                                ModelBackend.LM_STUDIO -> "Connetti LM Studio"
                                ModelBackend.OLLAMA    -> "Connetti Ollama"
                                else -> "Usa questo modello"
                            })
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

// ─── Plugins Screen (MCP Tool Management) ───────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PluginsScreen(
    servers: List<McpServer>,
    onAddServer: (McpServer) -> Unit,
    onDeleteServer: (String) -> Unit,
    onToggleServer: (String) -> Unit,
) {
    var showAddDialog by remember { mutableStateOf(false) }

    Column(Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text("Plugin MCP", fontWeight = FontWeight.SemiBold) },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface),
            actions = {
                IconButton(onClick = { showAddDialog = true }) {
                    Icon(Icons.Filled.Add, "Aggiungi server MCP")
                }
            },
        )
        HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.3f))

        if (servers.isEmpty()) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.padding(32.dp),
                ) {
                    Icon(
                        Icons.Outlined.Extension, null, Modifier.size(56.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f),
                    )
                    Spacer(Modifier.height(16.dp))
                    Text(
                        "Nessun plugin configurato",
                        style = MaterialTheme.typography.titleSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "Aggiungi un server MCP per estendere le capacità dell'agente.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                    )
                    Spacer(Modifier.height(20.dp))
                    Button(onClick = { showAddDialog = true }) {
                        Icon(Icons.Filled.Add, null, Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Aggiungi server")
                    }
                }
            }
        } else {
            LazyColumn(
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(servers, key = { it.id }) { server ->
                    McpServerCard(
                        server   = server,
                        onDelete = { onDeleteServer(server.id) },
                        onToggle = { onToggleServer(server.id) },
                    )
                }
            }
        }
    }

    if (showAddDialog) {
        AddMcpServerDialog(
            onDismiss = { showAddDialog = false },
            onConfirm = { name, url ->
                onAddServer(McpServer(name = name, url = url))
                showAddDialog = false
            },
        )
    }
}

@Composable
private fun McpServerCard(
    server: McpServer,
    onDelete: () -> Unit,
    onToggle: () -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surfaceVariant,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                Icons.Outlined.Extension, null, Modifier.size(22.dp),
                tint = if (server.enabled) MaterialTheme.colorScheme.primary
                       else MaterialTheme.colorScheme.outline,
            )
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    server.name,
                    fontWeight = FontWeight.SemiBold,
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (server.enabled) MaterialTheme.colorScheme.onSurface
                            else MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    server.url,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Switch(checked = server.enabled, onCheckedChange = { onToggle() })
            Spacer(Modifier.width(4.dp))
            IconButton(onClick = onDelete) {
                Icon(
                    Icons.Outlined.Delete, "Elimina", Modifier.size(20.dp),
                    tint = MaterialTheme.colorScheme.error,
                )
            }
        }
    }
}

@Composable
private fun AddMcpServerDialog(
    onDismiss: () -> Unit,
    onConfirm: (name: String, url: String) -> Unit,
) {
    var name by remember { mutableStateOf("") }
    var url  by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Aggiungi server MCP") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Nome") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = url,
                    onValueChange = { url = it },
                    label = { Text("URL (es. http://192.168.1.1:3000)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = { if (name.isNotBlank() && url.isNotBlank()) onConfirm(name.trim(), url.trim()) },
                enabled = name.isNotBlank() && url.isNotBlank(),
            ) { Text("Aggiungi") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Annulla") }
        },
    )
}

// ─── Skills Screen ────────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SkillsScreen(
    skills: List<Skill>,
    onToggleSkill: (id: String, enabled: Boolean) -> Unit,
    onDeleteSkill: (id: String) -> Unit,
    onCreateSkill: (name: String, description: String, instructions: String) -> Unit,
) {
    var showCreateDialog by remember { mutableStateOf(false) }

    Column(Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text("Skills", fontWeight = FontWeight.SemiBold) },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface),
            actions = {
                IconButton(onClick = { showCreateDialog = true }) {
                    Icon(Icons.Filled.Add, "Crea skill")
                }
            },
        )
        HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.3f))

        if (skills.isEmpty()) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.padding(32.dp),
                ) {
                    Icon(
                        Icons.Outlined.AutoAwesome, null, Modifier.size(56.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f),
                    )
                    Spacer(Modifier.height(16.dp))
                    Text(
                        "Nessuna skill ancora",
                        style = MaterialTheme.typography.titleSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "Gemma crea skill automaticamente durante i task complessi. " +
                        "Puoi anche crearne una manualmente con il pulsante +.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                    )
                    Spacer(Modifier.height(20.dp))
                    Button(onClick = { showCreateDialog = true }) {
                        Icon(Icons.Filled.Add, null, Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Crea skill")
                    }
                }
            }
        } else {
            LazyColumn(
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(skills, key = { it.id }) { skill ->
                    SkillCard(
                        skill    = skill,
                        onToggle = { onToggleSkill(skill.id, !skill.enabled) },
                        onDelete = { onDeleteSkill(skill.id) },
                    )
                }
            }
        }
    }

    if (showCreateDialog) {
        CreateSkillDialog(
            onDismiss = { showCreateDialog = false },
            onConfirm = { name, desc, inst ->
                onCreateSkill(name, desc, inst)
                showCreateDialog = false
            },
        )
    }
}

@Composable
private fun SkillCard(
    skill: Skill,
    onToggle: () -> Unit,
    onDelete: () -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }

    Surface(
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surfaceVariant,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(
                            skill.name,
                            fontWeight = FontWeight.SemiBold,
                            style = MaterialTheme.typography.bodyMedium,
                            color = if (skill.enabled) MaterialTheme.colorScheme.onSurface
                                    else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        val (authorIcon, authorLabel, authorColor) =
                            if (skill.createdBy == "gemma")
                                Triple(Icons.Outlined.SmartToy, "Gemma", MaterialTheme.colorScheme.primary)
                            else
                                Triple(Icons.Outlined.Person, "Utente", MaterialTheme.colorScheme.secondary)
                        SuggestionChip(
                            onClick = {},
                            label = { Text(authorLabel, fontSize = 10.sp) },
                            icon = { Icon(authorIcon, null, Modifier.size(12.dp)) },
                            colors = SuggestionChipDefaults.suggestionChipColors(
                                containerColor  = authorColor.copy(alpha = 0.12f),
                                labelColor      = authorColor,
                                iconContentColor = authorColor,
                            ),
                            modifier = Modifier.height(24.dp),
                        )
                    }
                    Text(
                        skill.description,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Switch(checked = skill.enabled, onCheckedChange = { onToggle() })
                Spacer(Modifier.width(4.dp))
                IconButton(onClick = onDelete) {
                    Icon(Icons.Outlined.Delete, "Elimina", Modifier.size(20.dp),
                        tint = MaterialTheme.colorScheme.error)
                }
            }

            // Tags
            if (skill.tags.isNotEmpty()) {
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    skill.tags.take(4).forEach { tag ->
                        AssistChip(
                            onClick = {},
                            label = { Text(tag, fontSize = 10.sp) },
                            modifier = Modifier.height(24.dp),
                        )
                    }
                }
            }

            // Usage + expand toggle
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                if (skill.usageCount > 0) {
                    Text(
                        "Usata ${skill.usageCount}×",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                    )
                }
                Spacer(Modifier.weight(1f))
                TextButton(onClick = { expanded = !expanded }) {
                    Text(if (expanded) "Nascondi" else "Istruzioni", fontSize = 12.sp)
                    Icon(
                        if (expanded) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore,
                        null, Modifier.size(16.dp),
                    )
                }
            }

            // Instructions (expandable)
            if (expanded && skill.instructions.isNotBlank()) {
                HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.2f))
                Spacer(Modifier.height(8.dp))
                Surface(shape = RoundedCornerShape(8.dp), color = MaterialTheme.colorScheme.surface) {
                    Text(
                        skill.instructions,
                        modifier = Modifier.padding(12.dp),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun CreateSkillDialog(
    onDismiss: () -> Unit,
    onConfirm: (name: String, description: String, instructions: String) -> Unit,
) {
    var name by remember { mutableStateOf("") }
    var desc by remember { mutableStateOf("") }
    var inst by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Crea skill") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Nome (es. daily_report)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = desc,
                    onValueChange = { desc = it },
                    label = { Text("Descrizione") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = inst,
                    onValueChange = { inst = it },
                    label = { Text("Istruzioni (passaggi dettagliati)") },
                    minLines = 4,
                    maxLines = 8,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    if (name.isNotBlank() && desc.isNotBlank() && inst.isNotBlank())
                        onConfirm(name.trim(), desc.trim(), inst.trim())
                },
                enabled = name.isNotBlank() && desc.isNotBlank() && inst.isNotBlank(),
            ) { Text("Crea") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Annulla") }
        },
    )
}

// ─── Settings Screen ──────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    shizukuState: ShizukuState,
    hasStorage: Boolean,
    hasCamera: Boolean,
    hasMicrophone: Boolean,
    hasCalendar: Boolean,
    hasContacts: Boolean,
    hasAccessibility: Boolean,
    activeModel: GemmaModel,
    serverPort: Int,
    lmStudioUrl: String,
    onLmStudioUrlChange: (String) -> Unit,
    ollamaUrl: String,
    ollamaModel: String,
    onOllamaConfigChange: (String, String) -> Unit,
    onRequestShizuku: () -> Unit,
    onRequestStorage: () -> Unit,
    onRequestCamera: () -> Unit,
    onRequestMicrophone: () -> Unit,
    onRequestCalendar: () -> Unit,
    onRequestContacts: () -> Unit,
    onRequestAccessibility: () -> Unit,
) {
    var lmUrlInput    by remember(lmStudioUrl) { mutableStateOf(lmStudioUrl) }
    var ollamaUrlInput by remember(ollamaUrl)  { mutableStateOf(ollamaUrl) }
    var ollamaMdlInput by remember(ollamaModel){ mutableStateOf(ollamaModel) }

    Column(Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text("Impostazioni", fontWeight = FontWeight.SemiBold) },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface),
        )
        HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.3f))

        LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {

            // LM Studio Server
            item {
                SettingsSection(title = "LM Studio (server locale)") {
                    Column(Modifier.padding(horizontal = 12.dp, vertical = 10.dp)) {
                        Text(
                            "Indirizzo IP del PC dove gira LM Studio",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                        Spacer(Modifier.height(4.dp))
                        Text(
                            "Il dispositivo Android e il PC devono essere sulla stessa rete WiFi. " +
                            "In LM Studio: Server ▶ Avvia server locale.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(Modifier.height(8.dp))
                        OutlinedTextField(
                            value = lmUrlInput,
                            onValueChange = { lmUrlInput = it },
                            label = { Text("URL server") },
                            placeholder = { Text("http://192.168.1.100:1234") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                            trailingIcon = {
                                if (lmUrlInput != lmStudioUrl) {
                                    TextButton(onClick = { onLmStudioUrlChange(lmUrlInput.trim()) }) {
                                        Text("Salva")
                                    }
                                }
                            },
                        )
                    }
                }
            }

            // Ollama (Termux) Section
            item {
                SettingsSection(title = "Ollama — Termux (inferenza locale)") {
                    Column(Modifier.padding(horizontal = 12.dp, vertical = 10.dp)) {
                        Text(
                            "Esegui modelli GGUF direttamente sul dispositivo con Termux + Ollama.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                        Spacer(Modifier.height(4.dp))
                        Text(
                            "Installa Termux dal F-Droid, poi esegui: pkg install ollama • ollama serve • ollama pull gemma4:2b-instruct-q4_0",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(Modifier.height(8.dp))
                        OutlinedTextField(
                            value = ollamaUrlInput,
                            onValueChange = { ollamaUrlInput = it },
                            label = { Text("URL Ollama") },
                            placeholder = { Text("http://localhost:11434") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        Spacer(Modifier.height(6.dp))
                        OutlinedTextField(
                            value = ollamaMdlInput,
                            onValueChange = { ollamaMdlInput = it },
                            label = { Text("Nome modello") },
                            placeholder = { Text("gemma4:2b-instruct-q4_0") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        Spacer(Modifier.height(8.dp))
                        val ollamaChanged = ollamaUrlInput != ollamaUrl || ollamaMdlInput != ollamaModel
                        if (ollamaChanged) {
                            Button(
                                onClick = { onOllamaConfigChange(ollamaUrlInput.trim(), ollamaMdlInput.trim()) },
                                modifier = Modifier.fillMaxWidth()
                            ) { Text("Salva configurazione Ollama") }
                        }
                    }
                }
            }

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
                    HorizontalDivider(Modifier.padding(horizontal = 12.dp), color = MaterialTheme.colorScheme.outline.copy(alpha = 0.15f))
                    PermissionRow(
                        label       = "Storage completo (FileSystemTool)",
                        description = "Necessario per leggere e scrivere file ovunque nel dispositivo",
                        granted     = hasStorage,
                        onRequest   = onRequestStorage,
                    )
                    HorizontalDivider(Modifier.padding(horizontal = 12.dp), color = MaterialTheme.colorScheme.outline.copy(alpha = 0.15f))
                    PermissionRow(
                        label       = "Fotocamera (CameraTool)",
                        description = "Permette all'agente di scattare foto e analizzare immagini",
                        granted     = hasCamera,
                        onRequest   = onRequestCamera,
                    )
                    HorizontalDivider(Modifier.padding(horizontal = 12.dp), color = MaterialTheme.colorScheme.outline.copy(alpha = 0.15f))
                    PermissionRow(
                        label       = "Microfono (Gemma Live)",
                        description = "Permette il dialogo vocale naturale nella nuova schermata Live",
                        granted     = hasMicrophone,
                        onRequest   = onRequestMicrophone,
                    )
                    HorizontalDivider(Modifier.padding(horizontal = 12.dp), color = MaterialTheme.colorScheme.outline.copy(alpha = 0.15f))
                    PermissionRow(
                        label       = "Calendario (GoogleIntegrationTool)",
                        description = "Permette di leggere e scrivere eventi sul calendario",
                        granted     = hasCalendar,
                        onRequest   = onRequestCalendar,
                    )
                    HorizontalDivider(Modifier.padding(horizontal = 12.dp), color = MaterialTheme.colorScheme.outline.copy(alpha = 0.15f))
                    PermissionRow(
                        label       = "Contatti (GoogleIntegrationTool)",
                        description = "Permette di leggere i contatti per l'integrazione email",
                        granted     = hasContacts,
                        onRequest   = onRequestContacts,
                    )
                    HorizontalDivider(Modifier.padding(horizontal = 12.dp), color = MaterialTheme.colorScheme.outline.copy(alpha = 0.15f))
                    PermissionRow(
                        label       = "Servizio accessibilità (UIInteractTool)",
                        description = "Permette all'agente di interagire con altre app tramite accessibilità",
                        granted     = hasAccessibility,
                        onRequest   = onRequestAccessibility,
                    )
                }
            }

            // Modello attivo
            item {
                SettingsSection(title = "Modello attivo") {
                    SettingsInfoRow(Icons.Outlined.SmartToy, "Modello", activeModel.name)
                    SettingsInfoRow(Icons.Outlined.Info, "Formato", when (activeModel.backend) {
                        ModelBackend.LM_STUDIO -> "LM Studio (OpenAI-compatible)"
                        ModelBackend.OLLAMA    -> "Ollama (OpenAI-compatible)"
                        else -> if (activeModel.filename.endsWith(".litertlm")) "LiteRT-LM" else "MediaPipe"
                    })
                    SettingsInfoRow(Icons.Outlined.Info, "Backend", when (activeModel.backend) {
                        ModelBackend.LM_STUDIO -> "Server remoto (PC) — $lmStudioUrl"
                        ModelBackend.OLLAMA    -> "Ollama Termux (locale) — $ollamaUrl"
                        else -> if (activeModel.useGpu) "GPU (fallback CPU)" else "CPU"
                    })
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

private fun readAttachment(context: Context, uri: Uri): Pair<String, String> {
    val name = context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
        val col = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
        if (cursor.moveToFirst() && col >= 0) cursor.getString(col) else null
    } ?: uri.lastPathSegment ?: "allegato"

    val mimeType = context.contentResolver.getType(uri) ?: ""
    val content = if (!mimeType.startsWith("image/") && !mimeType.startsWith("video/")) {
        runCatching {
            context.contentResolver.openInputStream(uri)?.bufferedReader()?.use {
                it.readText().take(6000)
            } ?: ""
        }.getOrDefault("")
    } else ""

    return Pair(name, content)
}

// ─── Dummy implementations ────────────────────────────────────────────────────

class DummyLlmInference : LlmInferenceWrapper {
    override suspend fun generateResponse(prompt: String) =
        "Nessun modello caricato. Vai in Modelli e scarica un modello Gemma."
}

class DummyEmbeddingModel : EmbeddingModelWrapper {
    override suspend fun getEmbedding(text: String) = FloatArray(384) { 0.1f }
}
