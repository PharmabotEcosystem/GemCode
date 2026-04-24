package com.example.agent.core

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

class GeminiApiLlmInference(private val apiKey: String) : LlmInferenceWrapper {
    
    override suspend fun generateResponse(prompt: String): String = withContext(Dispatchers.IO) {
        if (apiKey.isBlank() || apiKey == "YOUR_API_KEY") {
            return@withContext "Error: Gemini API Key is missing. Please set it in the app."
        }

        try {
            val url = URL("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}")
            val connection = url.openConnection() as HttpURLConnection
            connection.requestMethod = "POST"
            connection.setRequestProperty("Content-Type", "application/json")
            connection.doOutput = true

            // Costruisci il payload JSON
            val partsArray = JSONArray().put(JSONObject().put("text", prompt))
            val contentsArray = JSONArray().put(JSONObject().put("parts", partsArray))
            val jsonPayload = JSONObject().put("contents", contentsArray)

            val writer = OutputStreamWriter(connection.outputStream)
            writer.write(jsonPayload.toString())
            writer.flush()
            writer.close()

            val responseCode = connection.responseCode
            if (responseCode == HttpURLConnection.HTTP_OK) {
                val responseString = connection.inputStream.bufferedReader().use { it.readText() }
                val jsonResponse = JSONObject(responseString)
                val candidates = jsonResponse.getJSONArray("candidates")
                if (candidates.length() > 0) {
                    val content = candidates.getJSONObject(0).getJSONObject("content")
                    val parts = content.getJSONArray("parts")
                    if (parts.length() > 0) {
                        return@withContext parts.getJSONObject(0).getString("text")
                    }
                }
                return@withContext "Error: Unexpected response format from Gemini."
            } else {
                val errorString = connection.errorStream?.bufferedReader()?.use { it.readText() }
                return@withContext "Error: HTTP $responseCode - $errorString"
            }
        } catch (e: Exception) {
            return@withContext "Error: Failed to call Gemini API: ${e.message}"
        }
    }
}
