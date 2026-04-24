import React from 'react';
import {
  FolderOpen, Save, Trash2, Terminal, Globe, Brain,
  Sparkles, Plug, Volume2, Image, Video, Mic, Zap,
} from 'lucide-react';
import type {
  AgentPermissions, AppSettings, DraftFileOption, DraftFileState,
  PermissionDescriptor, Skill, VoiceBridgeSettings, VoiceOption,
} from './types';

export const STORAGE_KEY = 'gemcode-web-settings-v2';

export const DEFAULT_PERMISSIONS: AgentPermissions = {
  fileRead: 'ask', fileWrite: 'ask', fileDelete: 'deny',
  shellExec: 'ask', webSearch: 'allow', memoryRead: 'allow',
  memoryWrite: 'allow', skillRead: 'allow', skillWrite: 'ask',
  mcpConnect: 'ask', ttsSpeak: 'allow', imageGenerate: 'allow',
  videoAudioProcess: 'ask', peripheralAccess: 'deny', codeExecute: 'ask',
};

export const DEFAULT_SKILLS: Skill[] = [
  { id: 's1', name: 'Analisi Codice', description: 'Ottimizza e trova bug nel codice sorgente', systemPrompt: 'Sei un esperto sviluppatore senior. Analizza il codice per bug, performance e leggibilità.', tools: ['codeExecute'], enabled: true, category: 'system' },
  { id: 's2', name: 'Ricerca Web Avanzata', description: 'Esegue ricerche web approfondite e sintetizza i risultati', systemPrompt: 'Usa gli strumenti di ricerca web per trovare informazioni aggiornate e cita le fonti.', tools: ['webSearch'], enabled: true, category: 'system' },
];

export const DEFAULT_SETTINGS: AppSettings = {
  ollamaHost: 'http://localhost:11434', ollamaModel: 'gemma4', temperature: 0.7,
  systemPrompt: 'Sei GemCode Assistant, un assistente AI utile, preciso e conciso. Rispondi sempre in modo chiaro e diretto. Se non conosci qualcosa, dillo esplicitamente senza inventare.',
  bridgeUrl: 'http://localhost:10301', voiceDeviceId: 'box3',
  agentPermissions: DEFAULT_PERMISSIONS, skills: DEFAULT_SKILLS,
  autoSpeak: false, ttsMode: 'browser',
};

export const DEFAULT_VOICE_BRIDGE_SETTINGS: VoiceBridgeSettings = {
  agent_url: 'http://localhost:11434/api/chat', model: 'gemma4',
  system_prompt: "Rispondi sempre in italiano colloquiale come assistente vocale locale di GemCode. Mantieni la risposta molto breve: massimo due frasi corte. Non usare markdown, elenchi, titoli, citazioni o spiegazioni metalinguistiche. Se l'input e confuso, offensivo o sembra rumore, chiedi semplicemente di ripetere.",
  temperature: 0.2, max_response_sentences: 2, max_response_chars: 220,
  tts_provider: 'edge-tts', tts_voice: 'it-IT-ElsaNeural',
  device_id: 'box3', device_name: 'Home Assistant Voice PE', device_mode: 'ptt',
  wake_word_label: 'GEMMA', wake_word_model: 'placeholder - serve un modello GEMMA dedicato',
  wake_word_notes: 'Per una vera wake word GEMMA serve un modello micro_wake_word dedicato.',
};

export const TTS_PROVIDER_OPTIONS = [
  { value: 'edge-tts', label: 'Edge TTS gratuito' },
  { value: 'windows-sapi', label: 'Windows SAPI locale' },
];

export const TTS_VOICE_OPTIONS: VoiceOption[] = [
  { value: 'it-IT-ElsaNeural', label: 'Elsa Neural', provider: 'edge-tts' },
  { value: 'it-IT-IsabellaNeural', label: 'Isabella Neural', provider: 'edge-tts' },
  { value: 'Microsoft Elsa Desktop', label: 'Microsoft Elsa Desktop', provider: 'windows-sapi' },
  { value: 'Microsoft Elsa', label: 'Microsoft Elsa', provider: 'windows-sapi' },
];

export const SUGGESTION_CHIPS = [
  'Spiega come funziona un Transformer',
  "Scrivi un'API REST in Kotlin con Ktor",
  "Cos'e il pattern ReAct negli agenti AI?",
  'Crea uno script Python per analizzare un CSV',
];

export const TEXT_FILE_EXTENSIONS = new Set([
  'txt','md','markdown','json','js','jsx','ts','tsx','py','kt','kts','java',
  'xml','yaml','yml','csv','log','ini','cfg','conf','html','css','scss','sql','sh','ps1','bat','env','gitignore',
]);
export const IMAGE_FILE_EXTENSIONS = new Set(['png','jpg','jpeg','webp','gif','bmp']);

export const DRAFT_FILE_OPTIONS: DraftFileOption[] = [
  { value: 'txt', label: 'Testo (.txt)', extension: 'txt', mimeType: 'text/plain;charset=utf-8', mode: 'text' },
  { value: 'md', label: 'Markdown (.md)', extension: 'md', mimeType: 'text/markdown;charset=utf-8', mode: 'text' },
  { value: 'json', label: 'JSON (.json)', extension: 'json', mimeType: 'application/json;charset=utf-8', mode: 'text' },
  { value: 'js', label: 'JavaScript (.js)', extension: 'js', mimeType: 'text/javascript;charset=utf-8', mode: 'text' },
  { value: 'ts', label: 'TypeScript (.ts)', extension: 'ts', mimeType: 'text/typescript;charset=utf-8', mode: 'text' },
  { value: 'py', label: 'Python (.py)', extension: 'py', mimeType: 'text/x-python;charset=utf-8', mode: 'text' },
  { value: 'html', label: 'HTML (.html)', extension: 'html', mimeType: 'text/html;charset=utf-8', mode: 'text' },
  { value: 'docx', label: 'Word (.docx)', extension: 'docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', mode: 'docx' },
  { value: 'pdf', label: 'PDF (.pdf)', extension: 'pdf', mimeType: 'application/pdf', mode: 'pdf' },
];

export const FILE_PICKER_ACCEPT = '.txt,.md,.json,.js,.ts,.tsx,.py,.kt,.java,.xml,.yaml,.yml,.csv,.html,.css,.sql,.sh,.ps1,.bat,.pdf,.docx,.doc,.png,.jpg,.jpeg,.webp,.gif,.bmp';

export const DEFAULT_DRAFT_FILE: DraftFileState = { fileName: 'gemcode-note.md', format: 'md', content: '# GemCode\n\nScrivi qui appunti, codice o documentazione.' };

export const PERMISSION_DESCRIPTORS: PermissionDescriptor[] = [
  { key: 'fileRead', label: 'Lettura file', description: 'Leggere file e cartelle dal disco locale', icon: React.createElement(FolderOpen, { className: 'w-4 h-4' }), risk: 'low' },
  { key: 'fileWrite', label: 'Scrittura file', description: 'Creare e modificare file sul disco locale', icon: React.createElement(Save, { className: 'w-4 h-4' }), risk: 'medium' },
  { key: 'fileDelete', label: 'Eliminazione file', description: 'Eliminare file e cartelle dal disco', icon: React.createElement(Trash2, { className: 'w-4 h-4' }), risk: 'high' },
  { key: 'shellExec', label: 'Esecuzione comandi', description: 'Eseguire comandi nel terminale', icon: React.createElement(Terminal, { className: 'w-4 h-4' }), risk: 'high' },
  { key: 'codeExecute', label: 'Esecuzione codice', description: 'Eseguire codice generato', icon: React.createElement(Zap, { className: 'w-4 h-4' }), risk: 'high' },
  { key: 'webSearch', label: 'Ricerca web', description: 'Cercare informazioni su internet', icon: React.createElement(Globe, { className: 'w-4 h-4' }), risk: 'low' },
  { key: 'memoryRead', label: 'Lettura memoria', description: 'Consultare file di memoria', icon: React.createElement(Brain, { className: 'w-4 h-4' }), risk: 'low' },
  { key: 'memoryWrite', label: 'Scrittura memoria', description: 'Scrivere nuovi ricordi', icon: React.createElement(Brain, { className: 'w-4 h-4' }), risk: 'low' },
  { key: 'skillRead', label: 'Lettura skills', description: 'Leggere e usare skills', icon: React.createElement(Sparkles, { className: 'w-4 h-4' }), risk: 'low' },
  { key: 'skillWrite', label: 'Scrittura skills', description: 'Creare e modificare skills', icon: React.createElement(Sparkles, { className: 'w-4 h-4' }), risk: 'medium' },
  { key: 'mcpConnect', label: 'Connessione MCP', description: 'Connettersi a server MCP', icon: React.createElement(Plug, { className: 'w-4 h-4' }), risk: 'medium' },
  { key: 'ttsSpeak', label: 'Sintesi vocale', description: 'Generare audio parlato', icon: React.createElement(Volume2, { className: 'w-4 h-4' }), risk: 'low' },
  { key: 'imageGenerate', label: 'Generazione immagini', description: 'Creare immagini generative', icon: React.createElement(Image, { className: 'w-4 h-4' }), risk: 'low' },
  { key: 'videoAudioProcess', label: 'Elaborazione media', description: 'Processare video e audio', icon: React.createElement(Video, { className: 'w-4 h-4' }), risk: 'medium' },
  { key: 'peripheralAccess', label: 'Accesso periferiche', description: 'Interagire con hardware', icon: React.createElement(Mic, { className: 'w-4 h-4' }), risk: 'high' },
];
