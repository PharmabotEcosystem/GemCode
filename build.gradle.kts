// ============================================================================
// build.gradle.kts — Root project build file
// ============================================================================
// Plugin versions are declared here and applied in submodule build files.
// Keep versions in sync:
//   - Kotlin 2.0.21 → KSP 2.0.21-1.0.28
//   - Kotlin 2.0.21 → Compose plugin 2.0.21 (replaces kotlinCompilerExtensionVersion)
//   - AGP 8.7.3     → Gradle 8.10.2 (see gradle-wrapper.properties)
// ============================================================================

plugins {
    id("com.android.application")            version "8.7.3"    apply false
    id("org.jetbrains.kotlin.android")       version "2.0.21"   apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.0.21"  apply false
    id("org.jetbrains.kotlin.plugin.serialization") version "2.0.21" apply false
    // KSP: must match Kotlin version exactly (major.minor.patch-ksp.major.minor.patch)
    id("com.google.devtools.ksp")            version "2.0.21-1.0.28" apply false
    id("com.google.dagger.hilt.android")     version "2.51.1"   apply false
}
