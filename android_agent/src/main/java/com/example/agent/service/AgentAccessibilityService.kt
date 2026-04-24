package com.example.agent.service

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.graphics.PixelFormat
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.widget.FrameLayout
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.platform.ComposeView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import androidx.lifecycle.ViewModelStore
import androidx.lifecycle.ViewModelStoreOwner
import androidx.lifecycle.setViewTreeLifecycleOwner
import androidx.lifecycle.setViewTreeViewModelStoreOwner
import androidx.savedstate.SavedStateRegistry
import androidx.savedstate.SavedStateRegistryController
import androidx.savedstate.SavedStateRegistryOwner
import androidx.savedstate.setViewTreeSavedStateRegistryOwner
import com.example.agent.ui.OverlayUI
import dagger.hilt.android.AndroidEntryPoint

/**
 * # AgentAccessibilityService
 *
 * Servizio di accessibilità che permette all'agente di interagire con la UI
 * di altre app. Gestisce anche l'overlay flottante (Co-pilota).
 */
@AndroidEntryPoint
class AgentAccessibilityService : AccessibilityService(), LifecycleOwner, ViewModelStoreOwner, SavedStateRegistryOwner {
    
    companion object {
        /** Istanza singleton per permettere ai Tool di accedere alle API di accessibilità. */
        var instance: AgentAccessibilityService? = null
            private set
    }

    private lateinit var windowManager: WindowManager
    private var overlayView: View? = null
    
    // ── Lifecycle components for Compose (Service doesn't have them by default) ──
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
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        
        val composeView = ComposeView(this).apply {
            setContent {
                MaterialTheme {
                    OverlayUI(
                        onClose = { hideOverlay() }
                    )
                }
            }
        }

        // Setup necessari per far funzionare Compose in una Window esterna
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
        // Eventuale cattura dinamica di eventi UI
    }

    override fun onInterrupt() {
        // Richiamato quando il sistema interrompe il feedback
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
