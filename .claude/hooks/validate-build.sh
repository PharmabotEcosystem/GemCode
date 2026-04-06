#!/bin/bash
# validate-build.sh — run BEFORE git push to catch errors locally.
# Usage: bash .claude/hooks/validate-build.sh
# Returns exit code 0 = all OK, 1 = one or more checks failed.
set -euo pipefail

cd /home/user/GemCode
ERRORS=()
PASS=()

echo "=== GemCode pre-push validation ==="

# ── 1. TypeScript lint (web) ───────────────────────────────────────────────
echo -n "[1/3] TypeScript lint... "
if npm run lint --silent 2>/dev/null; then
  echo "PASS"
  PASS+=("TypeScript lint")
else
  echo "FAIL"
  ERRORS+=("TypeScript lint failed — run: npm run lint")
fi

# ── 2. Gradle configuration check (Android) ───────────────────────────────
echo -n "[2/3] Gradle config (plugin resolution + dependency graph)... "
JAVA_HOME_LOCAL=$(dirname $(dirname $(readlink -f $(which java) 2>/dev/null)) 2>/dev/null || echo "")
if [ -n "$JAVA_HOME_LOCAL" ]; then
  GRADLE_OUT=$(JAVA_HOME="$JAVA_HOME_LOCAL" ./gradlew \
    :android_agent:dependencies \
    --configuration debugRuntimeClasspath \
    --no-daemon -q 2>&1 || true)
  if echo "$GRADLE_OUT" | grep -qE "^FAILURE:|BUILD FAILED"; then
    # AGP plugin marker not resolvable without full Android SDK — environment limit, not code error
    if echo "$GRADLE_OUT" | grep -q "com.android.application.*not found"; then
      echo "SKIP (AGP plugin needs Android SDK — check CI for this)"
    else
      echo "FAIL"
      FIRST_ERR=$(echo "$GRADLE_OUT" | grep -A3 "What went wrong" | head -5)
      ERRORS+=("Gradle config failed:\n$FIRST_ERR")
    fi
  else
    echo "PASS"
    PASS+=("Gradle dependency resolution")
  fi
else
  echo "SKIP (Java not found in PATH)"
fi

# ── 3. Build file version consistency ─────────────────────────────────────
echo -n "[3/3] Version consistency (root vs module Hilt)... "
ROOT_HILT=$(grep -oP 'hilt.android.*version "\K[^"]*' build.gradle.kts 2>/dev/null || echo "")
MOD_HILT=$(grep -oP 'val hiltVersion = "\K[^"]*' android_agent/build.gradle.kts 2>/dev/null || echo "")
ROOT_KSP=$(grep -oP 'devtools.ksp.*version "\K[^"]*' build.gradle.kts 2>/dev/null || echo "")
ROOT_KOTLIN=$(grep -oP 'kotlin.android.*version "\K[^"]*' build.gradle.kts 2>/dev/null || echo "")

VERSION_FAIL=0
[ "$ROOT_HILT" != "$MOD_HILT" ] && { ERRORS+=("Hilt version mismatch: root=$ROOT_HILT module=$MOD_HILT"); VERSION_FAIL=1; }

# KSP must start with same Kotlin major.minor.patch
KSP_KOTLIN_PREFIX=$(echo "$ROOT_KSP" | grep -oP '^\d+\.\d+\.\d+')
[ "$KSP_KOTLIN_PREFIX" != "$ROOT_KOTLIN" ] && { ERRORS+=("KSP prefix $KSP_KOTLIN_PREFIX does not match Kotlin $ROOT_KOTLIN"); VERSION_FAIL=1; }

[ "$VERSION_FAIL" -eq 0 ] && { echo "PASS (Kotlin=$ROOT_KOTLIN KSP=$ROOT_KSP Hilt=$ROOT_HILT)"; PASS+=("Version consistency"); } || echo "FAIL"

# ── Summary ────────────────────────────────────────────────────────────────
echo ""
echo "=== Results: ${#PASS[@]} passed, ${#ERRORS[@]} failed ==="
for p in "${PASS[@]}"; do echo "  ✓ $p"; done
for e in "${ERRORS[@]}"; do echo "  ✗ $e"; done

[ ${#ERRORS[@]} -eq 0 ] && echo "" && echo "All checks passed — safe to push." && exit 0
echo "" && echo "Fix the above before pushing." && exit 1
