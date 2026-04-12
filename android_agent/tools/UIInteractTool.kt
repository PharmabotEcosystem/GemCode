package com.example.agent.tools

import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.view.accessibility.AccessibilityNodeInfo
import android.os.Bundle
import android.util.Log
import com.example.agent.service.AgentAccessibilityService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * # UIInteractTool
 *
 * Tool per interagire con la UI di altre app.
 * Richiede che [AgentAccessibilityService] sia abilitato nelle Impostazioni.
 */
class UIInteractTool : Tool {
    override val name = "UIInteractTool"
    override val description = "Interacts with the screen UI (click, scroll) using AccessibilityService."
    override val parametersSchema = """
        {
          "type": "object",
          "properties": {
            "action": { "type": "string", "enum": ["click_node", "click_coordinates", "scroll_up", "scroll_down", "input_text", "check_state", "dump_ui"] },
            "nodeId": { "type": "string", "description": "View ID to interact with (for 'click_node', 'input_text', 'check_state')" },
            "x": { "type": "number", "description": "X coordinate (for 'click_coordinates')" },
            "y": { "type": "number", "description": "Y coordinate (for 'click_coordinates')" },
            "text": { "type": "string", "description": "Text to input (for 'input_text')" }
          },
          "required": ["action"]
        }
    """.trimIndent()

    override suspend fun execute(params: JsonObject): String = withContext(Dispatchers.Main) {
        val service = AgentAccessibilityService.instance ?: return@withContext "Error: AccessibilityService is not connected. Please enable it in Settings."
        
        val action = params["action"]?.jsonPrimitive?.content ?: return@withContext "Error: action required."

        return@withContext try {
            when (action) {
                "click_node" -> {
                    val nodeId = params["nodeId"]?.jsonPrimitive?.content ?: return@withContext "Error: nodeId required."
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
                    val x = params["x"]?.jsonPrimitive?.content?.toFloat() ?: return@withContext "Error: x required."
                    val y = params["y"]?.jsonPrimitive?.content?.toFloat() ?: return@withContext "Error: y required."
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
                    val nodeId = params["nodeId"]?.jsonPrimitive?.content ?: return@withContext "Error: nodeId required."
                    val text = params["text"]?.jsonPrimitive?.content ?: return@withContext "Error: text required."
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
                    val nodeId = params["nodeId"]?.jsonPrimitive?.content ?: return@withContext "Error: nodeId required."
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
            Log.e("UIInteractTool", "Error during UI interaction", e)
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
            sb.appendLine("$indent[${node.className}] id='$id' text='$text' desc='$desc' bounds=[${rect.left},${rect.top}][${rect.right},${rect.bottom}] click=${node.isClickable}")
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
