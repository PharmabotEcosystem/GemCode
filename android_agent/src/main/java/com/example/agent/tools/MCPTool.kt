package com.example.agent.tools

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.*
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

class MCPTool : Tool {
    override val name = "mcp_tool"
    override val description = "Model Context Protocol (MCP) client tool. Allows connecting to an MCP server via HTTP. Actions: 'call_mcp' (requires 'url', 'method', 'params_json')."
    override val parametersSchema = """
        {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["call_mcp"]},
                "url": {"type": "string", "description": "MCP server HTTP endpoint"},
                "method": {"type": "string", "description": "JSON-RPC method name"},
                "params_json": {"type": "string", "description": "JSON string of parameters"}
            },
            "required": ["action", "url", "method"]
        }
    """.trimIndent()

    override suspend fun execute(params: JsonObject): String = withContext(Dispatchers.IO) {
        val action = params["action"]?.jsonPrimitive?.content ?: return@withContext "Error: Missing action"
        
        if (action != "call_mcp") return@withContext "Error: Unknown action '${action}'"
        
        val urlStr = params["url"]?.jsonPrimitive?.content ?: return@withContext "Error: Missing url"
        val method = params["method"]?.jsonPrimitive?.content ?: return@withContext "Error: Missing method"
        val paramsJsonStr = params["params_json"]?.jsonPrimitive?.content ?: "{}"
        
        try {
            val url = URL(urlStr)
            val connection = url.openConnection() as HttpURLConnection
            connection.requestMethod = "POST"
            connection.setRequestProperty("Content-Type", "application/json")
            connection.doOutput = true
            
            val jsonRpcRequest = buildJsonObject {
                put("jsonrpc", "2.0")
                put("id", 1)
                put("method", method)
                try {
                    put("params", Json.parseToJsonElement(paramsJsonStr))
                } catch (e: Exception) {
                    put("params", buildJsonObject {})
                }
            }
            
            OutputStreamWriter(connection.outputStream).use { writer ->
                writer.write(jsonRpcRequest.toString())
                writer.flush()
            }
            
            val responseCode = connection.responseCode
            if (responseCode == HttpURLConnection.HTTP_OK) {
                connection.inputStream.bufferedReader().use { it.readText() }
            } else {
                "Error: Server returned HTTP $responseCode\n" + connection.errorStream?.bufferedReader()?.use { it.readText() }
            }
        } catch (e: Exception) {
            "Error calling MCP server: ${e.message}"
        }
    }
}
