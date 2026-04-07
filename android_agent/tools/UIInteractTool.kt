package com.example.agent.tools

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.view.accessibility.AccessibilityNodeInfo
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

import android.view.accessibility.AccessibilityEvent
import android.os.Bundle
import android.graphics.PixelFormat
import android.view.Gravity
import android.view.WindowManager
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.compose.ui.platform.ComposeView
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.Alignment
import androidx.compose.foundation.background
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.graphics.Color
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Android
import androidx.compose.material.icons.filled.Close
import androidx.lifecycle.setViewTreeLifecycleOwner
import androidx.lifecycle.setViewTreeViewModelStoreOwner
import androidx.savedstate.setViewTreeSavedStateRegistryOwner
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleRegistry
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ViewModelStore
import androidx.lifecycle.ViewModelStoreOwner
import androidx.savedstate.SavedStateRegistry
import androidx.savedstate.SavedStateRegistryController
import androidx.savedstate.SavedStateRegistryOwner

/**
 * Tool per interagire con la UI di altre app.
 * Richiede che l'app sia abilitata come AccessibilityService nelle impostazioni.
 */
class UIInteractTool : Tool {
    override val name = "UIInteractTool"
    override val description = "Interacts with the screen UI (click, scroll) using AccessibilityService."
    override val parametersSchema = """
        {
          "type": "object",
          "properties": {
            "action": { "type": "string", "enum": ["click_node", "click_coordinates", "scroll_up", "scroll_down", "input_text", "check_state", "take_photo", "dump_ui"] },
            "nodeId": { "type": "string", "description": "View ID to interact with (for 'click_node', 'input_text', 'check_state')" },
            "x": { "type": "number", "description": "X coordinate (for 'click_coordinates')" },
            "y": { "type": "number", "description": "Y coordinate (for 'click_coordinates')" },
            "text": { "type": "string", "description": "Text to input (for 'input_text')" }
          },
          "required": ["action"]
        }
    """.trimIndent()

    override suspend fun execute(params: JsonElement): String = withContext(Dispatchers.Main) {
        val service = AgentAccessibilityService.instance ?: return@withContext "Error: AccessibilityService is not connected. Please enable it in Settings."
        
        val action = params.jsonObject["action"]?.jsonPrimitive?.content ?: return@withContext "Error: action required."

        return@withContext try {
            when (action) {
                "click_node" -> {
                    val nodeId = params.jsonObject["nodeId"]?.jsonPrimitive?.content ?: return@withContext "Error: nodeId required."
                    val rootNode = service.rootInActiveWindow
                    val nodes = rootNode?.findAccessibilityNodeInfosByViewId(nodeId)
                    
                    if (!nodes.isNullOrEmpty()) {
                        val node = nodes[0]
                        if (node.isClickable) {
                            node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                            "Success: Clicked node $nodeId"
                        } else {
                            // Fallback: click al centro del nodo se non è esplicitamente clickable
                            val rect = android.graphics.Rect()
                            node.getBoundsInScreen(rect)
                            performClickAt(service, rect.centerX().toFloat(), rect.centerY().toFloat())
                            "Success: Clicked coordinates of node $nodeId"
                        }
                    } else {
                        "Error: Node $nodeId not found."
                    }
                }
                "click_coordinates" -> {
                    val x = params.jsonObject["x"]?.jsonPrimitive?.content?.toFloat() ?: return@withContext "Error: x required."
                    val y = params.jsonObject["y"]?.jsonPrimitive?.content?.toFloat() ?: return@withContext "Error: y required."
                    performClickAt(service, x, y)
                    "Success: Clicked at ($x, $y)"
                }
                "scroll_up", "scroll_down" -> {
                    val displayMetrics = service.resources.displayMetrics
                    val width = displayMetrics.widthPixels.toFloat()
                    val height = displayMetrics.heightPixels.toFloat()
                    
                    val centerX = width / 2f
                    
                    // scroll_down means content moves up, so swipe from bottom to top
                    val startY = if (action == "scroll_down") height * 0.8f else height * 0.2f
                    val endY = if (action == "scroll_down") height * 0.2f else height * 0.8f
                    
                    performSwipe(service, centerX, startY, centerX, endY)
                    "Success: Performed $action"
                }
                "input_text" -> {
                    val nodeId = params.jsonObject["nodeId"]?.jsonPrimitive?.content ?: return@withContext "Error: nodeId required."
                    val text = params.jsonObject["text"]?.jsonPrimitive?.content ?: return@withContext "Error: text required."
                    val rootNode = service.rootInActiveWindow
                    val nodes = rootNode?.findAccessibilityNodeInfosByViewId(nodeId)
                    
                    if (!nodes.isNullOrEmpty()) {
                        val node = nodes[0]
                        val arguments = Bundle().apply {
                            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
                        }
                        node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, arguments)
                        "Success: Input text into node $nodeId"
                    } else {
                        "Error: Node $nodeId not found."
                    }
                }
                "check_state" -> {
                    val nodeId = params.jsonObject["nodeId"]?.jsonPrimitive?.content ?: return@withContext "Error: nodeId required."
                    val rootNode = service.rootInActiveWindow
                    val nodes = rootNode?.findAccessibilityNodeInfosByViewId(nodeId)
                    
                    if (!nodes.isNullOrEmpty()) {
                        val node = nodes[0]
                        val stateInfo = """
                            Text: ${node.text}
                            ContentDescription: ${node.contentDescription}
                            IsClickable: ${node.isClickable}
                            IsEnabled: ${node.isEnabled}
                            IsChecked: ${node.isChecked}
                            IsScrollable: ${node.isScrollable}
                        """.trimIndent()
                        "Success: Node state:\n$stateInfo"
                    } else {
                        "Error: Node $nodeId not found."
                    }
                }
                "take_photo" -> {
                    val deferred = kotlinx.coroutines.CompletableDeferred<String>()
                    CameraCaptureActivity.photoResultDeferred = deferred
                    
                    val intent = android.content.Intent(service, CameraCaptureActivity::class.java)
                    intent.flags = android.content.Intent.FLAG_ACTIVITY_NEW_TASK
                    service.startActivity(intent)
                    
                    deferred.await()
                }
                "dump_ui" -> {
                    val rootNode = service.rootInActiveWindow
                    if (rootNode != null) {
                        val stringBuilder = StringBuilder()
                        dumpNode(rootNode, 0, stringBuilder)
                        "Success: UI Dump:\n$stringBuilder"
                    } else {
                        "Error: Cannot get root window."
                    }
                }
                else -> "Error: Unknown action $action"
            }
        } catch (e: Exception) {
            "Exception: ${e.message}"
        }
    }

    private fun performClickAt(service: AgentAccessibilityService, x: Float, y: Float) {
        val path = Path().apply { moveTo(x, y) }
        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, 100))
            .build()
        service.dispatchGesture(gesture, null, null)
    }

    private fun performSwipe(service: AgentAccessibilityService, startX: Float, startY: Float, endX: Float, endY: Float) {
        val path = Path().apply { 
            moveTo(startX, startY)
            lineTo(endX, endY)
        }
        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, 300))
            .build()
        service.dispatchGesture(gesture, null, null)
    }

    private fun dumpNode(node: AccessibilityNodeInfo, depth: Int, sb: StringBuilder) {
        val indent = "  ".repeat(depth)
        val rect = android.graphics.Rect()
        node.getBoundsInScreen(rect)
        
        val text = node.text?.toString()?.replace("\n", " ") ?: ""
        val desc = node.contentDescription?.toString()?.replace("\n", " ") ?: ""
        val id = node.viewIdResourceName ?: ""
        
        if (text.isNotBlank() || desc.isNotBlank() || id.isNotBlank() || node.isClickable) {
            sb.append("$indent[${node.className}] ")
            if (id.isNotBlank()) sb.append("id='$id' ")
            if (text.isNotBlank()) sb.append("text='$text' ")
            if (desc.isNotBlank()) sb.append("desc='$desc' ")
            sb.append("bounds=[${rect.left},${rect.top}][${rect.right},${rect.bottom}] ")
            if (node.isClickable) sb.append("clickable=true ")
            sb.append("\n")
        }
        
        for (i in 0 until node.childCount) {
            val child = node.getChild(i)
            if (child != null) {
                dumpNode(child, depth + 1, sb)
                child.recycle()
            }
        }
    }
}

// Implementazione del servizio
class AgentAccessibilityService : AccessibilityService(), LifecycleOwner, ViewModelStoreOwner, SavedStateRegistryOwner {
    companion object {
        var instance: AgentAccessibilityService? = null
            private set
    }

    private lateinit var windowManager: WindowManager
    private var overlayView: View? = null
    
    // Lifecycle components for Compose
    private val lifecycleRegistry = LifecycleRegistry(this)
    private val store = ViewModelStore()
    private val savedStateRegistryController = SavedStateRegistryController.create(this)

    override val lifecycle: Lifecycle get() = lifecycleRegistry
    override val viewModelStore: ViewModelStore get() = store
    override val savedStateRegistry: SavedStateRegistry get() = savedStateRegistryController.savedStateRegistry

    override fun onCreate() {
        super.onCreate()
        savedStateRegistryController.performRestore(null)
        lifecycleRegistry.handleLifecycleEvent(Lifecycle.Event.ON_CREATE)
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        lifecycleRegistry.handleLifecycleEvent(Lifecycle.Event.ON_START)
        lifecycleRegistry.handleLifecycleEvent(Lifecycle.Event.ON_RESUME)
        showOverlay()
    }

    private fun showOverlay() {
        windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
        
        val composeView = ComposeView(this).apply {
            setContent {
                MaterialTheme {
                    OverlayUI(
                        onClose = { hideOverlay() }
                    )
                }
            }
        }

        // Setup per far funzionare Compose fuori da un'Activity
        composeView.setViewTreeLifecycleOwner(this)
        composeView.setViewTreeViewModelStoreOwner(this)
        composeView.setViewTreeSavedStateRegistryOwner(this)

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.END
            x = 0
            y = 200
        }

        val frameLayout = FrameLayout(this)
        frameLayout.addView(composeView)
        overlayView = frameLayout

        windowManager.addView(overlayView, params)
    }
    
    private fun hideOverlay() {
        overlayView?.let {
            windowManager.removeView(it)
            overlayView = null
        }
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // Gestione eventi (es. catturare il testo a schermo)
    }

    override fun onInterrupt() {
        // Gestione interruzione
    }

    override fun onDestroy() {
        super.onDestroy()
        lifecycleRegistry.handleLifecycleEvent(Lifecycle.Event.ON_DESTROY)
        store.clear()
        hideOverlay()
        if (instance == this) {
            instance = null
        }
    }
}

@Composable
fun OverlayUI(onClose: () -> Unit) {
    var expanded by remember { mutableStateOf(false) }

    if (!expanded) {
        FloatingActionButton(
            onClick = { expanded = true },
            modifier = Modifier.padding(16.dp),
            shape = CircleShape
        ) {
            Icon(Icons.Default.Android, contentDescription = "Open Agent")
        }
    } else {
        Card(
            modifier = Modifier
                .padding(16.dp)
                .width(300.dp)
                .height(400.dp),
            elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp).fillMaxSize()) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("Agent", style = MaterialTheme.typography.titleMedium)
                    IconButton(onClick = { expanded = false }) {
                        Icon(Icons.Default.Close, contentDescription = "Close")
                    }
                }
                Spacer(modifier = Modifier.height(8.dp))
                
                // Qui andrà la chat e l'input
                Box(modifier = Modifier.weight(1f).fillMaxWidth().background(Color.LightGray.copy(alpha = 0.2f))) {
                    Text("Agent is ready...", modifier = Modifier.padding(8.dp))
                }
                
                Spacer(modifier = Modifier.height(8.dp))
                Button(onClick = { /* TODO: Esegui agente */ }, modifier = Modifier.fillMaxWidth()) {
                    Text("Run Agent")
                }
            }
        }
    }
}
