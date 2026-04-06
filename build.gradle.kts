// ============================================================================
// build.gradle.kts — Root project build file
// ============================================================================
// Plugin versions are declared here and applied in submodule build files.
// Keep versions in sync:
//   - Kotlin 2.3.0  → KSP 2.3.6
//   - Kotlin 2.3.0  → Compose plugin 2.3.0 (replaces kotlinCompilerExtensionVersion)
//   - AGP 8.7.3     → Gradle 8.10.2 (see gradle-wrapper.properties)
//
// Note: KSP changed its versioning scheme at Kotlin 2.3.x — the "-1.0.x" patch
// suffix was dropped. KSP artifacts for Kotlin 2.3.x are published as plain
// "2.3.x" versions (e.g. 2.3.6). See https://github.com/google/ksp/releases
// ============================================================================

plugins {
    id("com.android.application")            version "8.7.3"    apply false
    id("org.jetbrains.kotlin.android")       version "2.3.0"    apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.3.0"   apply false
    id("org.jetbrains.kotlin.plugin.serialization") version "2.3.0" apply false
    // KSP 2.3.x uses a new versioning scheme: just the KSP release number, no Kotlin suffix
    id("com.google.devtools.ksp")            version "2.3.6"    apply false
    id("com.google.dagger.hilt.android")     version "2.51.1"   apply false
}
