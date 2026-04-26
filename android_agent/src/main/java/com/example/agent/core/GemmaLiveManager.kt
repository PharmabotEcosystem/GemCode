package com.example.agent.core

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.util.Locale
import javax.inject.Inject
import javax.inject.Singleton

enum class LiveState {
    IDLE,
    LISTENING,
    PROCESSING,
    SPEAKING,
    ERROR
}

@Singleton
class GemmaLiveManager @Inject constructor(
    private val context: Context
) {
    private var speechRecognizer: SpeechRecognizer? = null
    private var tts: TextToSpeech? = null
    
    private val _liveState = MutableStateFlow(LiveState.IDLE)
    val liveState: StateFlow<LiveState> = _liveState
    
    private val _recognizedText = MutableStateFlow("")
    val recognizedText: StateFlow<String> = _recognizedText

    private var ttsReady = false
    private var lastOnResultCallback: ((String) -> Unit)? = null

    init {
        initTTS()
    }

    var isContinuousMode = true

    private fun initTTS() {
        tts = TextToSpeech(context) { status ->
            if (status == TextToSpeech.SUCCESS) {
                val result = tts?.setLanguage(Locale.getDefault())
                if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                    Log.e("GemmaLiveManager", "TTS Language not supported")
                } else {
                    ttsReady = true
                    tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                        override fun onStart(utteranceId: String?) {
                            _liveState.value = LiveState.SPEAKING
                        }

                        override fun onDone(utteranceId: String?) {
                            _liveState.value = LiveState.IDLE
                            if (isContinuousMode) {
                                lastOnResultCallback?.let { callback ->
                                    android.os.Handler(android.os.Looper.getMainLooper()).post {
                                        startListening(callback)
                                    }
                                }
                            }
                        }

                        @Deprecated("Deprecated in Java")
                        override fun onError(utteranceId: String?) {
                            _liveState.value = LiveState.ERROR
                        }
                    })
                }
            } else {
                Log.e("GemmaLiveManager", "TTS Initialization failed")
            }
        }
    }

    fun startListening(onResult: (String) -> Unit) {
        lastOnResultCallback = onResult
        if (!SpeechRecognizer.isRecognitionAvailable(context)) {
            Log.e("GemmaLiveManager", "Speech recognition not available")
            _liveState.value = LiveState.ERROR
            return
        }

        if (speechRecognizer == null) {
            speechRecognizer = SpeechRecognizer.createSpeechRecognizer(context)
        }

        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault())
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        }

        speechRecognizer?.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {
                _liveState.value = LiveState.LISTENING
                _recognizedText.value = "Ascolto in corso..."
            }
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {
                _liveState.value = LiveState.PROCESSING
            }
            override fun onError(error: Int) {
                Log.e("GemmaLiveManager", "Speech recognition error: $error")
                _liveState.value = LiveState.ERROR
                _recognizedText.value = ""
            }
            override fun onResults(results: Bundle?) {
                val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                if (!matches.isNullOrEmpty()) {
                    val text = matches[0]
                    _recognizedText.value = text
                    onResult(text)
                }
            }
            override fun onPartialResults(partialResults: Bundle?) {
                val matches = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                if (!matches.isNullOrEmpty()) {
                    _recognizedText.value = matches[0]
                }
            }
            override fun onEvent(eventType: Int, params: Bundle?) {}
        })

        speechRecognizer?.startListening(intent)
    }

    fun stopListening() {
        speechRecognizer?.stopListening()
    }

    fun speak(text: String) {
        if (ttsReady) {
            _liveState.value = LiveState.SPEAKING
            val cleanText = cleanForSpeech(text)
            tts?.speak(cleanText, TextToSpeech.QUEUE_FLUSH, null, "LiveVoiceUtterance")
        }
    }

    /**
     * Ripulisce il testo da artefatti LLM, tool calls, JSON e markdown
     * per garantire un'esposizione vocale naturale e senza interruzioni tecniche.
     */
    private fun cleanForSpeech(text: String): String {
        var clean = text
        // 1. Rimuove blocchi di codice completi
        clean = clean.replace(Regex("```[\\s\\S]*?```"), " [Contenuto tecnico rimosso] ")
        // 2. Rimuove eventuali blocchi JSON orfani (tool calls sfuggite ai backtick)
        clean = clean.replace(Regex("\\{\\s*\"tool\"[\\s\\S]*?\\}"), "")
        // 3. Rimuove tag di regia/emozioni (es. [smile], {action:wave}, *sorride*)
        clean = clean.replace(Regex("\\[[a-zA-Z0-9_-]+\\]"), "")
        clean = clean.replace(Regex("\\{action:[^}]+\\}"), "")
        clean = clean.replace(Regex("\\*[^*]+\\*"), "")
        // 4. Pulizia Markdown (grassetto, corsivo, backtick singoli)
        clean = clean.replace(Regex("\\*\\*.*?\\*\\*"), "")
        clean = clean.replace(Regex("_[^_]+_"), "")
        clean = clean.replace(Regex("`[^`]+`"), "")
        // 5. Gestione link: mantiene il testo del link ma rimuove l'URL
        clean = clean.replace(Regex("\\[(.*?)\\]\\(.*?\\)"), "$1")
        // 6. Rimozione caratteri speciali residui e normalizzazione spazi
        clean = clean.replace(Regex("[#>\\[\\]*`_]"), " ")
        return clean.replace(Regex("\\s+"), " ").trim()
    }

    fun stopSpeaking() {
        if (ttsReady && tts?.isSpeaking == true) {
            tts?.stop()
            _liveState.value = LiveState.IDLE
        }
    }

    fun destroy() {
        speechRecognizer?.destroy()
        speechRecognizer = null
        tts?.stop()
        tts?.shutdown()
        tts = null
    }
}
