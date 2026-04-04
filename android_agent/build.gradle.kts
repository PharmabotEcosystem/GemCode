// ============================================================================
// build.gradle.kts — Android Agent Module
// ============================================================================
// Versioni centralizzate: aggiorna qui, applica ovunque
// ============================================================================

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.serialization")
    // KSP: annotation processor per Hilt, Room e Serialization
    // Sostituisce kapt (più veloce, supporta Kotlin incremental compilation)
    id("com.google.devtools.ksp")
    // Hilt plugin: genera il codice di wiring del grafo DI
    id("com.google.dagger.hilt.android")
}

android {
    namespace = "com.example.agent"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.example.agent"
        minSdk = 29          // Android 10+ — richiesto da MediaPipe Tasks GenAI
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
        debug {
            isMinifyEnabled = false
            applicationIdSuffix = ".debug"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
        // Abilita strict API per evitare tipi inferiti non intenzionali nelle interfacce pubbliche
        freeCompilerArgs += listOf("-Xexplicit-api=warning")
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    composeOptions {
        // Versione del Compose compiler allineata a Kotlin 2.0.x
        kotlinCompilerExtensionVersion = "1.5.14"
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
            // Evita conflitti con i file META-INF di MediaPipe e Coroutines
            excludes += "/META-INF/versions/9/previous-compilation-data.bin"
        }
    }

    // Source sets: include le directory "flat" usate per i moduli core e tools
    // (es. android_agent/core/, android_agent/tools/, ecc.)
    sourceSets {
        getByName("main") {
            java.srcDirs(
                "src/main/java",
                // Directory "flat" del progetto — stessa convenzione usata nei moduli esistenti
                "../../android_agent/core",
                "../../android_agent/memory",
                "../../android_agent/tools",
                "../../android_agent/ui",
                "../../android_agent/service",
                "../../android_agent/di",
                "../../android_agent/mvi",
                "../../android_agent/orchestrator",
                "../../android_agent/shizuku"
            )
        }
    }
}

// ============================================================================
// Versioni dipendenze
// ============================================================================

val hiltVersion = "2.51.1"
val roomVersion = "2.6.1"
val coroutinesVersion = "1.8.1"
val shizukuVersion = "13.1.0"
val composeVersion = "2024.09.00"  // BOM Compose

dependencies {

    // ── Compose BOM — allinea tutte le versioni Compose automaticamente ──────
    val composeBom = platform("androidx.compose:compose-bom:$composeVersion")
    implementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.activity:activity-compose:1.9.2")

    // ── Core Android ─────────────────────────────────────────────────────────
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.6")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.6")

    // ── Hilt DI ──────────────────────────────────────────────────────────────
    // CRITICO: hiltVersion deve corrispondere esattamente alla versione del plugin Hilt
    // dichiarato in build.gradle.kts (project-level) sotto plugins { }.
    implementation("com.google.dagger:hilt-android:$hiltVersion")
    ksp("com.google.dagger:hilt-compiler:$hiltVersion")

    // Hilt ViewModel integration — abilita @HiltViewModel e hiltViewModel() in Compose
    implementation("androidx.hilt:hilt-navigation-compose:1.2.0")

    // ── Coroutines ───────────────────────────────────────────────────────────
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:$coroutinesVersion")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:$coroutinesVersion")

    // ── MediaPipe LLM Inference ───────────────────────────────────────────────
    // mmap del modello gestito internamente da LiteRT via setModelPath().
    // Non usare mai ByteArray per caricare i pesi — vedere ResourceManager.
    // 0.10.22+: supporto .task format (Gemma 3 / Gemma 4), Backend.GPU enum, finestra 8192 token
    implementation("com.google.mediapipe:tasks-genai:0.10.22")

    // ── Room (VectorMemoryDB) ────────────────────────────────────────────────
    // KSP genera i DAO implementation a compile time — zero reflection a runtime.
    implementation("androidx.room:room-runtime:$roomVersion")
    implementation("androidx.room:room-ktx:$roomVersion")
    ksp("androidx.room:room-compiler:$roomVersion")

    // ── Kotlinx Serialization ────────────────────────────────────────────────
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.3")

    // ── Shizuku ──────────────────────────────────────────────────────────────
    // api: interfaccia Shizuku (binder IPC, Shizuku.newProcess(), ecc.)
    // provider: ContentProvider necessario per inizializzare il binder al boot
    implementation("dev.rikka.shizuku:api:$shizukuVersion")
    implementation("dev.rikka.shizuku:provider:$shizukuVersion")

    // ── Networking (per GeminiApiLlmInference e MCPTool) ────────────────────
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    // ── Debug tools ──────────────────────────────────────────────────────────
    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}
