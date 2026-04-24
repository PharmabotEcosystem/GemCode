package com.example.agent.ui

import android.content.pm.PackageManager
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import rikka.shizuku.Shizuku

/**
 * Rappresenta lo stato attuale della connessione a Shizuku.
 */
enum class ShizukuState {
    UNAVAILABLE,  // Shizuku non è in esecuzione o non è installato
    UNAUTHORIZED, // Shizuku è in esecuzione ma l'app non ha i permessi
    AUTHORIZED    // Shizuku è in esecuzione e i permessi sono stati garantiti
}

/**
 * Componente UI (Jetpack Compose) per monitorare e richiedere i permessi di Shizuku.
 * Questo assicura che il SettingsTool possa funzionare correttamente.
 */
@Composable
fun ShizukuSetupCard(
    shizukuState: ShizukuState,
    onRequestPermission: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                text = "System Control (Shizuku)",
                style = MaterialTheme.typography.titleMedium
            )
            
            when (shizukuState) {
                ShizukuState.UNAVAILABLE -> {
                    Text(
                        text = "Shizuku is not running. Please start it via Wireless Debugging or ADB to allow the agent to modify system settings.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.error
                    )
                }
                ShizukuState.UNAUTHORIZED -> {
                    Text(
                        text = "Shizuku is running, but permission is not granted. The agent cannot use SettingsTool.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color(0xFFE65100) // Orange warning
                    )
                    Button(
                        onClick = onRequestPermission,
                        modifier = Modifier.align(Alignment.End)
                    ) {
                        Text("Grant Permission")
                    }
                }
                ShizukuState.AUTHORIZED -> {
                    Text(
                        text = "✅ Shizuku is active and authorized. SettingsTool is ready.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color(0xFF2E7D32) // Green success
                    )
                }
            }
        }
    }
}

/**
 * Funzione helper per controllare lo stato attuale di Shizuku.
 */
fun checkShizukuState(): ShizukuState {
    return try {
        if (!Shizuku.pingBinder()) return ShizukuState.UNAVAILABLE
        if (Shizuku.checkSelfPermission() == PackageManager.PERMISSION_GRANTED)
            ShizukuState.AUTHORIZED
        else
            ShizukuState.UNAUTHORIZED
    } catch (_: Exception) {
        ShizukuState.UNAVAILABLE
    }
}
