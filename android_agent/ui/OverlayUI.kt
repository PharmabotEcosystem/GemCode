package com.example.agent.ui

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Android
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.example.agent.service.AgentForegroundService

/**
 * # OverlayUI
 *
 * Interfaccia flottante dell'agente (Co-pilota).
 * Permette di avviare l'analisi della schermata corrente con un solo tocco.
 */
@Composable
fun OverlayUI(onClose: () -> Unit) {
    val context = LocalContext.current
    var expanded by remember { mutableStateOf(false) }

    if (!expanded) {
        FloatingActionButton(
            onClick = { expanded = true },
            modifier = Modifier.padding(16.dp),
            shape = CircleShape,
            containerColor = MaterialTheme.colorScheme.primaryContainer,
            contentColor = MaterialTheme.colorScheme.onPrimaryContainer
        ) {
            Icon(Icons.Default.Android, contentDescription = "Open Agent")
        }
    } else {
        Card(
            modifier = Modifier
                .padding(16.dp)
                .width(300.dp)
                .height(200.dp), // Ridotta altezza per il trigger diretto
            elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp).fillMaxSize()) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("GemCode Co-pilot", style = MaterialTheme.typography.titleMedium)
                    IconButton(onClick = { expanded = false }) {
                        Icon(Icons.Default.Close, contentDescription = "Close")
                    }
                }
                
                Spacer(modifier = Modifier.height(12.dp))
                
                Text(
                    "L'agente analizzerà la schermata per aiutarti.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                
                Spacer(modifier = Modifier.weight(1f))
                
                Button(
                    onClick = { 
                        // Prompt Co-pilota: analisi contestuale della schermata
                        val copilotPrompt = "Analizza la schermata corrente (UI dump) e suggerisci come procedere o chiedi all'utente cosa fare per aiutarlo in questo contesto."
                        
                        val intent = Intent(context, AgentForegroundService::class.java).apply {
                            action = AgentForegroundService.ACTION_SUBMIT_PROMPT
                            putExtra(AgentForegroundService.EXTRA_PROMPT, copilotPrompt)
                        }
                        context.startService(intent)
                        expanded = false // Chiudi dopo l'invio
                    }, 
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Avvia Co-pilota")
                }
            }
        }
    }
}
