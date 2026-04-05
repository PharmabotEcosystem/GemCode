#!/bin/bash
# PostToolUse hook — fires when a .kt or .kts file inside android_agent/ is modified.
# Injects a compatibility checklist as additionalContext.

FILE=$(jq -r '.tool_input.file_path // ""' 2>/dev/null)

# Only act on Android Kotlin/Gradle files
if ! echo "$FILE" | grep -qE 'android_agent/.*\.(kt|kts)$'; then
  exit 0
fi

jq -n '{
  hookSpecificOutput: {
    hookEventName: "PostToolUse",
    additionalContext: "Android file modified — compatibility checklist:\n• Compose: use org.jetbrains.kotlin.plugin.compose (Kotlin 2.0+), NOT kotlinCompilerExtensionVersion\n• Hilt: @AndroidEntryPoint on every Activity/Service that uses @Inject or hiltViewModel()\n• Coroutines: use lifecycleScope (Activity) or viewModelScope (ViewModel), NOT bare CoroutineScope(IO)\n• sourceSets paths: relative to android_agent/ module dir (e.g. \"core\", NOT \"../../android_agent/core\")\n• AgentModule: LlmInferenceWrapper and MutableLlmInferenceWrapper must share same @Singleton instance"
  }
}'
