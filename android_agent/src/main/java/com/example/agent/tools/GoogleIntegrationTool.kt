package com.example.agent.tools

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.CalendarContract
import kotlinx.serialization.json.*
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

class GoogleIntegrationTool(private val context: Context) : Tool {
    override val name = "google_integration_tool"
    override val description = "Interact with Google Mail and Calendar. Actions: 'send_email' (requires 'to', 'subject', 'body'), 'create_event' (requires 'title', 'description', 'location', optional 'start_date', 'end_date' in ISO 8601 format, 'timezone')."
    override val parametersSchema = """
        {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["send_email", "create_event"]},
                "to": {"type": "string"},
                "subject": {"type": "string"},
                "body": {"type": "string"},
                "title": {"type": "string"},
                "description": {"type": "string"},
                "location": {"type": "string"},
                "start_date": {"type": "string", "description": "ISO 8601 format, e.g., 2026-04-04T10:00:00Z"},
                "end_date": {"type": "string", "description": "ISO 8601 format, e.g., 2026-04-04T11:00:00Z"},
                "timezone": {"type": "string", "description": "Timezone ID, e.g., America/Los_Angeles"}
            },
            "required": ["action"]
        }
    """.trimIndent()

    private fun parseDateToMillis(dateStr: String): Long? {
        val formats = listOf(
            SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX", Locale.US),
            SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") },
            SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US),
            SimpleDateFormat("yyyy-MM-dd", Locale.US)
        )
        for (format in formats) {
            try {
                val date = format.parse(dateStr)
                if (date != null) return date.time
            } catch (e: Exception) {
                // Ignore and try next
            }
        }
        return null
    }

    override suspend fun execute(params: JsonElement): String {
        val action = params.jsonObject["action"]?.jsonPrimitive?.content ?: return "Error: Missing action"
        
        return try {
            when (action) {
                "send_email" -> {
                    val to = params.jsonObject["to"]?.jsonPrimitive?.content ?: ""
                    val subject = params.jsonObject["subject"]?.jsonPrimitive?.content ?: ""
                    val body = params.jsonObject["body"]?.jsonPrimitive?.content ?: ""
                    
                    val intent = Intent(Intent.ACTION_SENDTO).apply {
                        data = Uri.parse("mailto:")
                        putExtra(Intent.EXTRA_EMAIL, arrayOf(to))
                        putExtra(Intent.EXTRA_SUBJECT, subject)
                        putExtra(Intent.EXTRA_TEXT, body)
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    context.startActivity(intent)
                    "Email intent launched successfully."
                }
                "create_event" -> {
                    val title = params.jsonObject["title"]?.jsonPrimitive?.content ?: ""
                    val description = params.jsonObject["description"]?.jsonPrimitive?.content ?: ""
                    val location = params.jsonObject["location"]?.jsonPrimitive?.content ?: ""
                    val startDateStr = params.jsonObject["start_date"]?.jsonPrimitive?.content
                    val endDateStr = params.jsonObject["end_date"]?.jsonPrimitive?.content
                    val timezone = params.jsonObject["timezone"]?.jsonPrimitive?.content
                    
                    val intent = Intent(Intent.ACTION_INSERT).apply {
                        data = CalendarContract.Events.CONTENT_URI
                        putExtra(CalendarContract.Events.TITLE, title)
                        putExtra(CalendarContract.Events.DESCRIPTION, description)
                        putExtra(CalendarContract.Events.EVENT_LOCATION, location)
                        
                        startDateStr?.let { parseDateToMillis(it) }?.let { 
                            putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, it) 
                        }
                        endDateStr?.let { parseDateToMillis(it) }?.let { 
                            putExtra(CalendarContract.EXTRA_EVENT_END_TIME, it) 
                        }
                        timezone?.let { 
                            putExtra(CalendarContract.Events.EVENT_TIMEZONE, it) 
                        }
                        
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    context.startActivity(intent)
                    "Calendar event intent launched successfully."
                }
                else -> "Error: Unknown action '$action'"
            }
        } catch (e: Exception) {
            "Error executing ${action}: ${e.message}"
        }
    }
}
