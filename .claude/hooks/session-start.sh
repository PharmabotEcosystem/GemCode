#!/bin/bash
# SessionStart hook — injects GemCode repo state as context for Claude.
# Outputs JSON with additionalContext so Claude knows branch/status without being asked.
set -euo pipefail

cd /home/user/GemCode

BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
LOG=$(git log --oneline -5 2>/dev/null || echo "(no commits)")
STATUS=$(git status --short 2>/dev/null)
STATUS=${STATUS:-(clean)}

jq -n \
  --arg branch "$BRANCH" \
  --arg log "$LOG" \
  --arg status "$STATUS" \
  '{
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: ("## GemCode Repo — Session Context\n\n**Repo:** PharmabotEcosystem/GemCode\n**Branch:** " + $branch + "\n**Dev branch:** claude/fix-android-build-runtime-6wbYC\n\n**Stack:**\n- Android: android_agent/ — Kotlin 2.0.21, AGP 8.7.3, Hilt 2.51.1, Compose plugin\n- Web: src/ — React 19, TypeScript 5.8, Vite 6\n- Gradle: 8.10.2 | KSP: 2.0.21-1.0.28\n\n**Recent commits:**\n" + $log + "\n\n**Working tree:**\n" + $status)
    }
  }'
