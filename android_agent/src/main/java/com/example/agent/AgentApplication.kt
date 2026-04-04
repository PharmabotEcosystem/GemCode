package com.example.agent

import android.app.Application
import dagger.hilt.android.HiltAndroidApp

/**
 * # AgentApplication — entry point del grafo DI Hilt.
 *
 * `@HiltAndroidApp` triggera la generazione del codice Hilt al compile time:
 * - Crea il `SingletonComponent` e tutti i subcomponent (ActivityComponent, ecc.)
 * - Genera `AgentApplication_GeneratedInjector` che Hilt usa internamente
 * - Inizializza tutti i `@Singleton` provider al primo accesso (lazy by default)
 *
 * ## Ciclo di vita del SingletonComponent
 * Il `SingletonComponent` è legato al ciclo di vita di questa `Application`.
 * I provider `@Singleton` (LocalMemoryManager, LlmInferenceWrapper, ToolRegistry, ecc.)
 * vengono costruiti UNA SOLA VOLTA e rimangono in memoria per tutta la sessione.
 * Questo è esattamente ciò che vogliamo per:
 * - Il database Room (nessun conflitto di lock SQLite)
 * - Il motore LLM (nessun mmap multiplo dello stesso file)
 * - Il ToolRegistry (nessuna duplicazione dei tool)
 *
 * ## Da registrare in AndroidManifest.xml
 * ```xml
 * <application android:name=".AgentApplication" ...>
 * ```
 */
@HiltAndroidApp
class AgentApplication : Application()
