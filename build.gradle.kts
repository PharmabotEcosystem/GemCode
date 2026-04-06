// ============================================================================
// build.gradle.kts — Root project build file
// ============================================================================
// Plugin versions are declared here and applied in submodule build files.
// Keep versions in sync:
//   - Kotlin 2.3.0  → KSP 2.3.0-1.0.29
//   - Kotlin 2.3.0  → Compose plugin 2.3.0 (replaces kotlinCompilerExtensionVersion)
//   - AGP 8.7.3     → Gradle 8.10.2 (see gradle-wrapper.properties)
//
// Kotlin 2.3.0 required because:
//   - litertlm-android:0.10.0 was compiled with Kotlin metadata 2.3.0
//   - kotlin-reflect/kotlin-stdlib transitive deps pulled at 2.2.x (metadata 2.2.0)
//   Both are incompatible with Kotlin 2.0.x (metadata 2.0.0).
// ============================================================================

plugins {
    id("com.android.application")            version "8.7.3"    apply false
    id("org.jetbrains.kotlin.android")       version "2.3.0"    apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.3.0"   apply false
    id("org.jetbrains.kotlin.plugin.serialization") version "2.3.0" apply false
    // KSP: must match Kotlin version exactly (major.minor.patch-ksp.major.minor.patch)
    id("com.google.devtools.ksp")            version "2.3.0-1.0.29" apply false
    id("com.google.dagger.hilt.android")     version "2.51.1"   apply false
}
