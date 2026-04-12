package com.example.agent.shizuku

import android.content.pm.PackageManager
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.channels.ProducerScope
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.channelFlow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import rikka.shizuku.Shizuku
import javax.inject.Inject
import javax.inject.Singleton

// ─────────────────────────────────────────────────────────────────────────────
// Sealed hierarchy per lo stato del servizio Shizuku
// ─────────────────────────────────────────────────────────────────────────────

/** Rappresenta la disponibilità istantanea del daemon Shizuku. */
sealed interface ShizukuStatus {
    /** Shizuku è in esecuzione e i permessi sono stati accordati. */
    data object Available : ShizukuStatus

    /**
     * Il daemon Shizuku non è in esecuzione, non è installato,
     * o il binder non è ancora connesso.
     */
    data object DaemonNotRunning : ShizukuStatus

    /**
     * Shizuku è in esecuzione ma l'app non ha ancora i permessi.
     * La UI deve richiedere `Shizuku.requestPermission(requestCode)`.
     */
    data object PermissionDenied : ShizukuStatus
}

// ─────────────────────────────────────────────────────────────────────────────
// Sealed hierarchy per gli output del comando
// ─────────────────────────────────────────────────────────────────────────────

/** Frammento di output emesso durante l'esecuzione di un comando shell. */
sealed interface CommandOutput {
    /** Riga letta da stdout del processo figlio. */
    data class Stdout(val line: String) : CommandOutput

    /** Riga letta da stderr del processo figlio. */
    data class Stderr(val line: String) : CommandOutput

    /** Exit code del processo; sempre l'ultimo elemento emesso dal Flow. */
    data class ExitCode(val code: Int) : CommandOutput
}

/** Risultato aggregato di un comando completato (utile per chiamanti che non vogliono il Flow). */
sealed interface CommandResult {
    data class Success(val stdout: String, val stderr: String, val exitCode: Int) : CommandResult
    data class Failure(val stdout: String, val stderr: String, val exitCode: Int) : CommandResult
    data class ShizukuUnavailable(val status: ShizukuStatus) : CommandResult
    data class ExecutionError(val exception: Throwable) : CommandResult
}

// ─────────────────────────────────────────────────────────────────────────────
// ShizukuCommandExecutor
// ─────────────────────────────────────────────────────────────────────────────

/**
 * # ShizukuCommandExecutor
 *
 * Esegue comandi shell con privilegi ADB tramite le API ufficiali di Shizuku
 * (`Shizuku.newProcess()`), senza mai passare per `Runtime.getRuntime().exec()`.
 *
 * ## Perché NON usare Runtime.exec()?
 * - `Runtime.exec()` forka dal processo dell'app (UID app, nessun privilegio ADB).
 * - `Shizuku.newProcess()` forka dal daemon Shizuku (UID 2000 = shell ADB),
 *   consentendo comandi privilegiati come `settings put global`, `cmd`, `dumpsys`, ecc.
 *
 * ## Problema del deadlock stdout/stderr
 * Un processo figlio ha buffer limitati (~64 KB). Se leggiamo prima tutto stdout
 * e poi stderr, il processo figlio si blocca quando il buffer di stderr è pieno
 * (perché nessuno lo consuma) → deadlock.
 *
 * **Soluzione**: usiamo `channelFlow {}` con due coroutine lanciate in parallelo
 * (`async {}` su Dispatchers.IO), ognuna responsabile di drenare un solo stream.
 * `process.waitFor()` viene chiamato solo DOPO che entrambi gli stream sono stati
 * completamente svuotati — garantendo che il processo sia uscito.
 *
 * ```
 *  channelFlow {
 *      val stdout = async { drainStream(process.inputStream, CommandOutput::Stdout) }
 *      val stderr = async { drainStream(process.errorStream, CommandOutput::Stderr) }
 *      stdout.await()
 *      stderr.await()
 *      send(CommandOutput.ExitCode(process.waitFor()))
 *  }
 * ```
 *
 * ## Thread safety
 * `Shizuku.newProcess()` è thread-safe secondo la documentazione di Shizuku 13.x.
 * Le letture degli stream sono eseguite su `Dispatchers.IO` (pool di thread bloccanti).
 */
@Singleton
class ShizukuCommandExecutor @Inject constructor() {

    companion object {
        private const val TAG = "ShizukuExecutor"

        /** Shell da usare per l'esecuzione dei comandi. */
        private val SHELL = arrayOf("sh", "-c")
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Status check
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Controlla istantaneamente la disponibilità di Shizuku.
     *
     * Questa funzione NON lancia coroutine ed è safe da chiamare sul Main Thread,
     * ma è consigliabile chiamarla su Dispatchers.IO per non bloccare la UI
     * nei casi limite (es. binder IPC lento al boot).
     *
     * @return [ShizukuStatus.Available] se pronto, altrimenti il motivo del fallback.
     */
    fun checkStatus(): ShizukuStatus {
        return when {
            !Shizuku.pingBinder() -> {
                Log.w(TAG, "Shizuku binder not available — daemon not running?")
                ShizukuStatus.DaemonNotRunning
            }
            Shizuku.checkSelfPermission() != PackageManager.PERMISSION_GRANTED -> {
                Log.w(TAG, "Shizuku running but permission not granted to this app.")
                ShizukuStatus.PermissionDenied
            }
            else -> ShizukuStatus.Available
        }
    }

    /** Ritorna `true` solo se Shizuku è Available — shorthand per i guard nei tool. */
    fun isAvailable(): Boolean = checkStatus() == ShizukuStatus.Available

    // ─────────────────────────────────────────────────────────────────────────
    // Flow-based async execution
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Esegue [command] tramite Shizuku e restituisce un [Flow] di [CommandOutput].
     *
     * Il Flow emette:
     *   1. Zero o più [CommandOutput.Stdout] (una per riga)
     *   2. Zero o più [CommandOutput.Stderr] (una per riga, in parallelo)
     *   3. Esattamente un [CommandOutput.ExitCode] come ultimo elemento
     *
     * Se Shizuku non è disponibile, il Flow completa immediatamente **senza** emettere
     * nulla e lancia [ShizukuUnavailableException] — il chiamante deve gestirla
     * o usare [executeAndCollect] che converte tutto in un [CommandResult].
     *
     * **Non blocca il Main Thread** — internamente usa `flowOn(Dispatchers.IO)`.
     *
     * ### Esempio di utilizzo
     * ```kotlin
     * executor.execute("dumpsys battery")
     *     .collect { output ->
     *         when (output) {
     *             is CommandOutput.Stdout -> appendToLog(output.line)
     *             is CommandOutput.Stderr -> showError(output.line)
     *             is CommandOutput.ExitCode -> handleExit(output.code)
     *         }
     *     }
     * ```
     *
     * @param command  Comando shell completo (es. `"settings put global wifi_on 1"`).
     * @param env      Variabili d'ambiente opzionali (null = eredita dall'ambiente Shizuku).
     * @param workDir  Directory di lavoro opzionale (null = directory default).
     */
    fun execute(
        command: String,
        env: Array<String>? = null,
        workDir: String? = null
    ): Flow<CommandOutput> = channelFlow {
        val status = checkStatus()
        if (status != ShizukuStatus.Available) {
            throw ShizukuUnavailableException(status)
        }

        Log.d(TAG, "Executing via Shizuku: $command")

        val process = Shizuku.newProcess(SHELL + command, env, workDir)

        try {
            // Drena stdout e stderr in parallelo per evitare deadlock da buffer overflow.
            // `coroutineScope {}` garantisce che entrambe le async siano completate
            // prima di proseguire a `waitFor()`.
            coroutineScope {
                val stdoutJob = async(Dispatchers.IO) {
                    drainStream(process.inputStream.bufferedReader()) { line ->
                        trySend(CommandOutput.Stdout(line))
                    }
                }
                val stderrJob = async(Dispatchers.IO) {
                    drainStream(process.errorStream.bufferedReader()) { line ->
                        trySend(CommandOutput.Stderr(line))
                    }
                }
                stdoutJob.await()
                stderrJob.await()
            }

            val exitCode = withContext(Dispatchers.IO) { process.waitFor() }
            Log.d(TAG, "Command exited with code $exitCode: $command")
            send(CommandOutput.ExitCode(exitCode))

        } finally {
            // Distrugge il processo figlio se il Flow viene cancellato prima del termine.
            // `destroy()` invia SIGTERM al processo shell Shizuku — safe e non forza
            // la chiusura del daemon Shizuku stesso.
            process.destroy()
        }
    }.flowOn(Dispatchers.IO)

    // ─────────────────────────────────────────────────────────────────────────
    // Suspend aggregate wrapper
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Esegue [command] e attende il completamento, restituendo un [CommandResult] aggregato.
     *
     * Funzione di convenienza per i tool del ReAct loop che necessitano di una stringa
     * "Observation" da restituire all'LLM — senza gestire il Flow manualmente.
     *
     * ```kotlin
     * val result = executor.executeAndCollect("settings put global airplane_mode_on 1")
     * val observation = when (result) {
     *     is CommandResult.Success   -> "Successo: ${result.stdout}"
     *     is CommandResult.Failure   -> "Errore (exit ${result.exitCode}): ${result.stderr}"
     *     is CommandResult.ShizukuUnavailable -> "Shizuku non disponibile: ${result.status}"
     *     is CommandResult.ExecutionError     -> "Eccezione: ${result.exception.message}"
     * }
     * ```
     *
     * @param command    Comando shell da eseguire.
     * @param timeoutMs  Timeout opzionale in ms. Se il processo non restituisce
     *                   [CommandOutput.ExitCode] entro questo intervallo, il Flow
     *                   viene cancellato (Shizuku invia SIGTERM al processo figlio
     *                   tramite il `finally { process.destroy() }` in [execute]),
     *                   e viene restituito [CommandResult.Failure] con exit code -1
     *                   e un messaggio stderr che descrive il timeout.
     *                   0 = nessun timeout (default).
     */
    suspend fun executeAndCollect(
        command: String,
        env: Array<String>? = null,
        workDir: String? = null,
        timeoutMs: Long = 0L
    ): CommandResult = withContext(Dispatchers.IO) {
        val status = checkStatus()
        if (status != ShizukuStatus.Available) {
            Log.w(TAG, "executeAndCollect: Shizuku not available ($status)")
            return@withContext CommandResult.ShizukuUnavailable(status)
        }

        val stdoutLines = StringBuilder()
        val stderrLines = StringBuilder()
        var exitCode = -1

        try {
            val timedOut: Boolean

            if (timeoutMs > 0L) {
                // withTimeoutOrNull cancels the Flow when the deadline passes;
                // the `finally { process.destroy() }` block in execute() sends
                // SIGTERM to the Shizuku child process automatically.
                val result = withTimeoutOrNull(timeoutMs) {
                    execute(command, env, workDir).collect { output ->
                        when (output) {
                            is CommandOutput.Stdout   -> stdoutLines.appendLine(output.line)
                            is CommandOutput.Stderr   -> stderrLines.appendLine(output.line)
                            is CommandOutput.ExitCode -> exitCode = output.code
                        }
                    }
                }
                timedOut = (result == null) // withTimeoutOrNull returns null on timeout
            } else {
                execute(command, env, workDir).collect { output ->
                    when (output) {
                        is CommandOutput.Stdout   -> stdoutLines.appendLine(output.line)
                        is CommandOutput.Stderr   -> stderrLines.appendLine(output.line)
                        is CommandOutput.ExitCode -> exitCode = output.code
                    }
                }
                timedOut = false
            }

            val stdout = stdoutLines.toString().trimEnd()
            val stderr  = stderrLines.toString().trimEnd()

            if (timedOut) {
                val timeoutMsg = "Command timed out after ${timeoutMs}ms: $command"
                Log.w(TAG, timeoutMsg)
                return@withContext CommandResult.Failure(
                    stdout = stdout,
                    stderr = if (stderr.isNotEmpty()) "$stderr\n$timeoutMsg" else timeoutMsg,
                    exitCode = -1
                )
            }

            return@withContext if (exitCode == 0) {
                CommandResult.Success(stdout, stderr, exitCode)
            } else {
                CommandResult.Failure(stdout, stderr, exitCode)
            }

        } catch (e: ShizukuUnavailableException) {
            return@withContext CommandResult.ShizukuUnavailable(e.status)
        } catch (e: Exception) {
            Log.e(TAG, "executeAndCollect exception for '$command'", e)
            return@withContext CommandResult.ExecutionError(e)
        }
    }

    /**
     * Produce l'stringa "Observation" formattata per il loop ReAct.
     * Comodo da usare direttamente in `Tool.execute()`.
     */
    suspend fun executeForObservation(command: String): String {
        return when (val result = executeAndCollect(command)) {
            is CommandResult.Success ->
                "Success (exit 0):\n${result.stdout.ifBlank { "(no output)" }}"

            is CommandResult.Failure ->
                "Command failed (exit ${result.exitCode}):\n" +
                        "stdout: ${result.stdout.ifBlank { "(empty)" }}\n" +
                        "stderr: ${result.stderr.ifBlank { "(empty)" }}"

            is CommandResult.ShizukuUnavailable ->
                when (result.status) {
                    ShizukuStatus.DaemonNotRunning ->
                        "Error: Shizuku daemon is not running. Start it via Wireless Debugging or ADB first."
                    ShizukuStatus.PermissionDenied ->
                        "Error: Shizuku permission not granted to this app. Open Shizuku and authorize the agent."
                    ShizukuStatus.Available ->
                        "Error: Shizuku unexpectedly unavailable." // Should never happen
                }

            is CommandResult.ExecutionError ->
                "Execution exception: ${result.exception.message}"
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Private helpers
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Legge tutte le righe da un [java.io.BufferedReader] e le emette via [emit].
     * Chiamare su `Dispatchers.IO` — `readLine()` è bloccante.
     *
     * Non lancia eccezioni: gli errori di I/O vengono loggati e lo stream viene chiuso.
     */
    private inline fun drainStream(
        reader: java.io.BufferedReader,
        crossinline emit: (String) -> Unit
    ) {
        try {
            reader.use { br ->
                var line: String?
                while (br.readLine().also { line = it } != null) {
                    emit(line!!)
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Stream read error (process may have exited early): ${e.message}")
        }
    }
}

/** Eccezione interna lanciata quando Shizuku non è disponibile al momento dell'esecuzione. */
class ShizukuUnavailableException(val status: ShizukuStatus) :
    IllegalStateException("Shizuku is not available: $status")
