// ============================================================================
// settings.gradle.kts — Root project settings
// ============================================================================

pluginManagement {
    repositories {
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        // LiteRT-LM (litertlm-android) — hosted on Google Maven
        maven { url = uri("https://maven.google.com") }
    }
}

rootProject.name = "GemCode"
include(":android_agent")
