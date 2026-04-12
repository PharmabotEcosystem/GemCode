package com.example.agent.di

import android.content.Context
import com.example.agent.core.SkillManager
import com.example.agent.shizuku.ShizukuCommandExecutor
import com.example.agent.tools.DefaultToolRegistry
import com.example.agent.tools.FileSystemTool
import com.example.agent.tools.GoogleIntegrationTool
import com.example.agent.tools.MCPTool
import com.example.agent.tools.SettingsTool
import com.example.agent.tools.ShellTool
import com.example.agent.tools.SkillTool
import com.example.agent.tools.Tool
import com.example.agent.tools.ToolRegistry
import com.example.agent.tools.UIInteractTool
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.ElementsIntoSet
import dagger.multibindings.IntoSet
import javax.inject.Singleton

/**
 * # ToolsModule — Hilt multibinding per il catalogo dei Tool.
 *
 * ## Pattern: Set Multibinding
 *
 * Ogni tool è dichiarato con `@Provides @IntoSet` — Hilt aggrega automaticamente
 * tutti i contributi in un unico `Set<Tool>` che viene iniettato in [DefaultToolRegistry].
 *
 * **Aggiungere un nuovo tool richiede solo:**
 * 1. Creare la classe `MyNewTool` che implementa `Tool`
 * 2. Aggiungere un `@Provides @IntoSet fun provideMyNewTool(): Tool` qui
 * 3. NESSUNA modifica all'`AgentLoop` o all'`AgentOrchestrator`
 *
 * ## Tool vs @Singleton
 * I tool sono `@Singleton` perché:
 * - Molti tool mantengono stato leggero (es. cache del path, lazy initialization).
 * - La loro costruzione può richiedere iniezione di dipendenze pesanti (Context, Shizuku).
 * - Creare più istanze non porta benefici e spreca memoria.
 *
 * ## `@JvmSuppressWildcards`
 * Necessario per il multibinding Kotlin: Kotlin genera `Set<? extends Tool>` internamente,
 * ma Hilt si aspetta `Set<Tool>`. L'annotazione sopprime la wildcard.
 *
 * ## Modulo diviso (abstract + companion)
 * `@Binds` richiede una classe astratta; `@Provides` funziona sia in classi che object.
 * Il pattern standard: classe astratta con `companion object` per i `@Provides`.
 */
@Module
@InstallIn(SingletonComponent::class)
abstract class ToolsModule {

    // ─────────────────────────────────────────────────────────────────────────
    // @Binds — lega DefaultToolRegistry all'interfaccia ToolRegistry
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Lega [DefaultToolRegistry] all'interfaccia [ToolRegistry].
     *
     * Hilt inietterà il `Set<Tool>` aggregato da tutti i `@IntoSet` nel
     * costruttore `@Inject` di [DefaultToolRegistry].
     */
    @Binds
    @Singleton
    abstract fun bindToolRegistry(impl: DefaultToolRegistry): ToolRegistry

    // ─────────────────────────────────────────────────────────────────────────
    // @Provides @IntoSet — ogni metodo contribuisce un tool al Set<Tool>
    // ─────────────────────────────────────────────────────────────────────────

    companion object {

        /**
         * Tool per lettura/scrittura file nel filesystem.
         * Non ha dipendenze esterne — costruzione triviale.
         */
        @Provides
        @Singleton
        @IntoSet
        fun provideFileSystemTool(): Tool = FileSystemTool()

        /**
         * Tool per modifica impostazioni di sistema via Shizuku.
         *
         * NOTA: l'attuale [SettingsTool] usa Shizuku direttamente.
         * In una refactoring successiva, sostituire con una versione che
         * accetta [ShizukuCommandExecutor] come dipendenza:
         *
         * ```kotlin
         * fun provideSettingsTool(executor: ShizukuCommandExecutor): Tool =
         *     SettingsTool(executor)
         * ```
         *
         * Per ora, la dipendenza è implicita nel body del tool via `Shizuku.newProcess()`.
         */
        @Provides
        @Singleton
        @IntoSet
        fun provideSettingsTool(): Tool = SettingsTool()

        /**
         * Tool per automazione UI via AccessibilityService.
         * L'istanza del servizio viene recuperata internamente dal companion object
         * di `AgentAccessibilityService`.
         */
        @Provides
        @Singleton
        @IntoSet
        fun provideUIInteractTool(): Tool = UIInteractTool()

        /**
         * Tool per salvataggio/esecuzione di skill persistenti.
         * Richiede [SkillManager] che incapsula la logica di serializzazione su disco.
         */
        @Provides
        @Singleton
        @IntoSet
        fun provideSkillTool(@ApplicationContext context: Context): Tool =
            SkillTool(SkillManager(context))

        /**
         * Tool per integrazione con Google Calendar e Gmail via intent.
         */
        @Provides
        @Singleton
        @IntoSet
        fun provideGoogleIntegrationTool(@ApplicationContext context: Context): Tool =
            GoogleIntegrationTool(context)

        /**
         * Tool per comunicazione con server MCP (Model Context Protocol) via HTTP.
         * Stateless — nessuna dipendenza richiesta.
         */
        @Provides
        @Singleton
        @IntoSet
        fun provideMCPTool(): Tool = MCPTool()

        /**
         * Tool per esecuzione shell privilegiata tramite [ShizukuCommandExecutor].
         *
         * Fornisce all'agente accesso generico a comandi ADB-level: am, pm,
         * dumpsys, input, getprop, df, ps, ecc. Richiede Shizuku attivo.
         * Il SafetyGuard filtra i comandi pericolosi prima dell'esecuzione.
         */
        @Provides
        @Singleton
        @IntoSet
        fun provideShellTool(executor: ShizukuCommandExecutor): Tool = ShellTool(executor)

        /**
         * Se in futuro nessun tool fosse disponibile (tutti commentati durante sviluppo),
         * `@ElementsIntoSet` garantisce che il Set non sia vuoto — Hilt richiede
         * almeno un contributo al Set oppure un `@ElementsIntoSet` con set vuoto.
         *
         * Lasciamo questo come safety net esplicito — non viene mai usato normalmente
         * perché i provider sopra sono attivi.
         */
        @Provides
        @ElementsIntoSet
        fun provideEmptyToolSetFallback(): Set<@JvmSuppressWildcards Tool> = emptySet()
    }
}
