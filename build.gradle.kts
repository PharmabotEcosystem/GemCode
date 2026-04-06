// ============================================================================
// build.gradle.kts — Root project build file
// ============================================================================
// Plugin versions are declared here and applied in submodule build files.
// Keep versions in sync:
//   - Kotlin 2.1.20 → KSP 2.1.20-1.0.32
//   - Kotlin 2.1.20 → Compose plugin 2.1.20 (replaces kotlinCompilerExtensionVersion)
//   - AGP 8.7.3     → Gradle 8.10.2 (see gradle-wrapper.properties)
//
// Kotlin 2.1.20 is the latest release with a published KSP artifact (2.1.20-1.0.32).
// KSP has not yet released builds for Kotlin 2.2.x or 2.3.x.
// The remaining metadata mismatches from litertlm-android (metadata 2.3.0) and the
// transitive kotlin-reflect/stdlib (metadata 2.2.0) are suppressed via
// -Xskip-metadata-version-check in android_agent/build.gradle.kts.
// ============================================================================

plugins {
    id("com.android.application")            version "8.7.3"    apply false
    id("org.jetbrains.kotlin.android")       version "2.1.20"   apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.1.20"  apply false
    id("org.jetbrains.kotlin.plugin.serialization") version "2.1.20" apply false
    // KSP: must match Kotlin version exactly (major.minor.patch-ksp.major.minor.patch)
    id("com.google.devtools.ksp")            version "2.1.20-1.0.32" apply false
    id("com.google.dagger.hilt.android")     version "2.51.1"   apply false
}
