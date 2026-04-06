#!/bin/bash
# SessionStart hook — installs deps + injects repo context for Claude.
set -euo pipefail

cd /home/user/GemCode

# ── Install web deps (cached after first run) ──────────────────────────────
if [ "${CLAUDE_CODE_REMOTE:-}" = "true" ]; then
  npm install --silent 2>/dev/null || true
fi

# ── Collect repo state ─────────────────────────────────────────────────────
BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
LOG=$(git log --oneline -5 2>/dev/null || echo "(no commits)")
STATUS=$(git status --short 2>/dev/null)
STATUS=${STATUS:-(clean)}

# ── Read current versions from build.gradle.kts ───────────────────────────
KOTLIN_VER=$(grep -oP "org.jetbrains.kotlin.android.*version \"\K[^\"]*" build.gradle.kts 2>/dev/null || echo "?")
KSP_VER=$(grep -oP "com.google.devtools.ksp.*version \"\K[^\"]*" build.gradle.kts 2>/dev/null || echo "?")
HILT_VER=$(grep -oP "com.google.dagger.hilt.android.*version \"\K[^\"]*" build.gradle.kts 2>/dev/null || echo "?")
AGP_VER=$(grep -oP "com.android.application.*version \"\K[^\"]*" build.gradle.kts 2>/dev/null || echo "?")

jq -n \
  --arg branch "$BRANCH" \
  --arg log    "$LOG" \
  --arg status "$STATUS" \
  --arg kotlin "$KOTLIN_VER" \
  --arg ksp    "$KSP_VER" \
  --arg hilt   "$HILT_VER" \
  --arg agp    "$AGP_VER" \
  '{
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: (
        "## GemCode Repo — Session Context\n\n" +
        "**Repo:** PharmabotEcosystem/GemCode\n" +
        "**Branch:** " + $branch + "\n\n" +
        "**Stack (live from build.gradle.kts):**\n" +
        "- Android: Kotlin " + $kotlin + " | KSP " + $ksp + " | Hilt " + $hilt + " | AGP " + $agp + "\n" +
        "- Android: Gradle 8.10.2 | Java 17 | minSdk 29 | compileSdk 35\n" +
        "- Web: React 19 | TypeScript 5.8 | Vite 6 | Tailwind 4\n\n" +
        "**Key build constraints:**\n" +
        "- kotlinOptions {} removed in Kotlin 2.2+ → use top-level kotlin { compilerOptions {} }\n" +
        "- Hilt 2.58+ requires AGP 9.0.0+; use Hilt ≤ 2.57.2 with AGP 8.x\n" +
        "- KSP 2.2.x uses new patch scheme: e.g. 2.2.21-2.0.5 (not 1.0.x)\n" +
        "- litertlm-android:0.10.0 needs -Xskip-metadata-version-check (metadata 2.3.0)\n" +
        "- Room @Database must have exportSchema = false or schemaLocation ksp arg\n" +
        "- Validate before push: .claude/hooks/validate-build.sh\n\n" +
        "**Recent commits:**\n" + $log + "\n\n" +
        "**Working tree:**\n" + $status
      )
    }
  }'
