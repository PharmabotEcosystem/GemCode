// Dipendenze Gradle necessarie per il progetto
// Aggiungere al build.gradle.kts (app-level)

dependencies {
    // MediaPipe LLM Inference per eseguire Gemma in locale
    // mmap è gestito internamente da MediaPipe per i file .task / .bin
    implementation("com.google.mediapipe:tasks-genai:0.10.14")

    // Shizuku API per esecuzione comandi ADB privilegiati
    val shizukuVersion = "13.1.0"
    implementation("dev.rikka.shizuku:api:$shizukuVersion")
    implementation("dev.rikka.shizuku:provider:$shizukuVersion")

    // Room per il database locale (Vector Search)
    val roomVersion = "2.6.1"
    implementation("androidx.room:room-runtime:$roomVersion")
    implementation("androidx.room:room-ktx:$roomVersion")
    // ksp("androidx.room:room-compiler:$roomVersion")

    // JSON parsing (Moshi o Kotlinx Serialization)
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.3")

    // Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.0")
}
