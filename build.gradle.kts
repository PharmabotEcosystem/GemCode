// ============================================================================
// build.gradle.kts — Root project build file
// ============================================================================
// Plugin versions are declared here and applied in submodule build files.
// Keep versions in sync:
//   - Kotlin 2.2.21 → KSP 2.2.21-2.0.5
//   - Kotlin 2.2.21 → Compose plugin 2.2.21 (replaces kotlinCompilerExtensionVersion)
//   - AGP 8.7.3     → Gradle 8.10.2 (see gradle-wrapper.properties)
//
// Kotlin 2.2.21 chosen because:
//   - Hilt 2.59.2 (latest) was compiled with Kotlin-bom 2.2.0 and does not support
//     KSP 2.3.x (new versioning scheme) — causes classloader mismatch at config time.
//   - KSP 2.2.21-2.0.5 is the latest KSP artifact for Kotlin 2.2.21.
//   - litertlm-android:0.10.0 (metadata 2.3.0) is handled via -Xskip-metadata-version-check.
//   - transitive kotlin-reflect/stdlib 2.2.21 (metadata 2.2.0) are natively compatible.
// ============================================================================

plugins {
    id("com.android.application")            version "8.7.3"    apply false
    id("org.jetbrains.kotlin.android")       version "2.2.21"   apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.2.21"  apply false
    id("org.jetbrains.kotlin.plugin.serialization") version "2.2.21" apply false
    // KSP: must match Kotlin version exactly (major.minor.patch-ksp.major.minor.patch)
    id("com.google.devtools.ksp")            version "2.2.21-2.0.5" apply false
    id("com.google.dagger.hilt.android")     version "2.59.2"   apply false
}
