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
    additionalContext: "Android file modified — compatibility checklist:\n• Kotlin 2.2.21: use top-level kotlin { compilerOptions { jvmTarget = JvmTarget.JVM_17 } } — NOT kotlinOptions {} (removed in 2.2+)\n• Compose: org.jetbrains.kotlin.plugin.compose plugin (Kotlin 2.0+), no kotlinCompilerExtensionVersion needed\n• Hilt 2.57.2: @AndroidEntryPoint on every Activity/Service using @Inject or hiltViewModel()\n• Hilt 2.58+ requires AGP 9.0.0+ — do NOT upgrade Hilt beyond 2.57.2 while on AGP 8.7.3\n• KSP 2.2.21-2.0.5: new patch suffix scheme (2.0.x, not 1.0.x) — must match Kotlin prefix exactly\n• litertlm-android:0.10.0: needs -Xskip-metadata-version-check (compiled with Kotlin 2.3.0 ABI)\n• Room @Database: exportSchema = false (or add ksp { arg(\"room.schemaLocation\", ...) })\n• Coroutines: use lifecycleScope (Activity) or viewModelScope (ViewModel)\n• sourceSets paths: relative to android_agent/ module dir (e.g. \"core\", NOT \"../../android_agent/core\")\n• Before pushing: run .claude/hooks/validate-build.sh"
  }
}'
