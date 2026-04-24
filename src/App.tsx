import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as mammoth from 'mammoth/mammoth.browser';
import {
  Sparkles,
  Plus,
  Send,
  Settings,
  ChevronLeft,
  ChevronRight,
  Trash2,
  X,
  MessageSquare,
  Cpu,
  Thermometer,
  FileText,
  Info,
  Copy,
  Check,
  Server,
  Wifi,
  WifiOff,
  AlertCircle,
  Radio,
  RefreshCw,
  Mic,
  SlidersHorizontal,
  Save,
  Boxes,
  Shield,
  Lock,
  FolderOpen,
  Terminal,
  Globe,
  Brain,
  Zap,
  Eye,
  Plug,
  Image,
  Video,
  Volume2,
} from 'lucide-react';
import { Document as DocxDocument, Packer, Paragraph, TextRun } from 'docx';
import { jsPDF } from 'jspdf';
import { motion, AnimatePresence } from 'motion/react';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  isStreaming?: boolean;
  apiText?: string;
  attachments?: ChatAttachment[];
}

interface Conversation {
  id: string;
  title: string;
  timestamp: Date;
}

type Reachability = 'online' | 'offline' | 'checking';

type PermissionPolicy = 'allow' | 'deny' | 'ask';

interface AgentPermissions {
  fileRead: PermissionPolicy;
  fileWrite: PermissionPolicy;
  fileDelete: PermissionPolicy;
  shellExec: PermissionPolicy;
  webSearch: PermissionPolicy;
  memoryRead: PermissionPolicy;
  memoryWrite: PermissionPolicy;
  skillRead: PermissionPolicy;
  skillWrite: PermissionPolicy;
  mcpConnect: PermissionPolicy;
  ttsSpeak: PermissionPolicy;
  imageGenerate: PermissionPolicy;
  videoAudioProcess: PermissionPolicy;
  peripheralAccess: PermissionPolicy;
  codeExecute: PermissionPolicy;
}

interface PermissionDescriptor {
  key: keyof AgentPermissions;
  label: string;
  description: string;
  icon: React.ReactNode;
  risk: 'low' | 'medium' | 'high';
}

interface AppSettings {
  ollamaHost: string;
  ollamaModel: string;
  temperature: number;
  systemPrompt: string;
  bridgeUrl: string;
  voiceDeviceId: string;
  agentPermissions: AgentPermissions;
}

interface VoiceBridgeSettings {
  agent_url: string;
  model: string;
  system_prompt: string;
  temperature: number;
  max_response_sentences: number;
  max_response_chars: number;
  tts_provider: string;
  tts_voice: string;
  device_id: string;
  device_name: string;
  device_mode: string;
  wake_word_label: string;
  wake_word_model: string;
  wake_word_notes: string;
}

interface VoiceDeviceStatus {
  device_id: string;
  device_name: string;
  remote_ip: string;
  firmware_mode: string;
  wake_word_label: string;
  wake_word_model: string;
  status: 'online' | 'offline' | 'unknown';
  last_seen_iso: string;
  voice_session_status: string;
  last_transcript: string;
  last_response_text: string;
  audio_url: string;
  error: string;
}

interface BridgeLogEntry {
  timestamp: string;
  level: string;
  message: string;
}

interface BridgeHealthSnapshot {
  status: string;
  public_host: string;
  bridge_settings_file: string;
  ports: {
    wyoming: number;
    http: number;
    udp_audio: number;
    udp_control: number;
  };
  device_count: number;
  active_sessions: number;
  error_sessions: number;
  latest_audio_url: string;
  latest_audio_device_id: string;
  latest_error: string;
  latest_transcript: string;
  latest_response_text: string;
  latest_seen_iso: string;
  recent_logs: BridgeLogEntry[];
  devices: VoiceDeviceStatus[];
}

interface ModelOption {
  name: string;
  family?: string;
  parameterSize?: string;
  quantization?: string;
}

interface VoiceOption {
  value: string;
  label: string;
  provider: string;
}

type AttachmentKind = 'image' | 'pdf' | 'docx' | 'text' | 'binary';

interface ChatAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: AttachmentKind;
  extractedText: string;
  previewText: string;
  imageDataUrl?: string;
  error?: string;
}

type DraftFormat = 'txt' | 'md' | 'json' | 'js' | 'ts' | 'py' | 'html' | 'docx' | 'pdf';

interface DraftFileOption {
  value: DraftFormat;
  label: string;
  extension: string;
  mimeType: string;
  mode: 'text' | 'docx' | 'pdf';
}

interface DraftFileState {
  fileName: string;
  format: DraftFormat;
  content: string;
}

const STORAGE_KEY = 'gemcode-web-settings-v2';

const DEFAULT_PERMISSIONS: AgentPermissions = {
  fileRead: 'ask',
  fileWrite: 'ask',
  fileDelete: 'deny',
  shellExec: 'ask',
  webSearch: 'allow',
  memoryRead: 'allow',
  memoryWrite: 'allow',
  skillRead: 'allow',
  skillWrite: 'ask',
  mcpConnect: 'ask',
  ttsSpeak: 'allow',
  imageGenerate: 'allow',
  videoAudioProcess: 'ask',
  peripheralAccess: 'deny',
  codeExecute: 'ask',
};

const DEFAULT_SETTINGS: AppSettings = {
  ollamaHost: 'http://localhost:11434',
  ollamaModel: 'gemma4',
  temperature: 0.7,
  systemPrompt:
    'Sei GemCode Assistant, un assistente AI utile, preciso e conciso. ' +
    'Rispondi sempre in modo chiaro e diretto. ' +
    'Se non conosci qualcosa, dillo esplicitamente senza inventare.',
  bridgeUrl: 'http://localhost:10301',
  voiceDeviceId: 'box3',
  agentPermissions: DEFAULT_PERMISSIONS,
};

const DEFAULT_VOICE_BRIDGE_SETTINGS: VoiceBridgeSettings = {
  agent_url: 'http://localhost:11434/api/chat',
  model: 'gemma4',
  system_prompt:
    'Rispondi sempre in italiano colloquiale come assistente vocale locale di GemCode. ' +
    'Mantieni la risposta molto breve: massimo due frasi corte. ' +
    'Non usare markdown, elenchi, titoli, citazioni o spiegazioni metalinguistiche. ' +
    'Se l\'input e confuso, offensivo o sembra rumore, chiedi semplicemente di ripetere.',
  temperature: 0.2,
  max_response_sentences: 2,
  max_response_chars: 220,
  tts_provider: 'edge-tts',
  tts_voice: 'it-IT-ElsaNeural',
  device_id: 'box3',
  device_name: 'Home Assistant Voice PE',
  device_mode: 'ptt',
  wake_word_label: 'GEMMA',
  wake_word_model: 'placeholder - serve un modello GEMMA dedicato',
  wake_word_notes: 'Per una vera wake word GEMMA serve un modello micro_wake_word dedicato.',
};

const TTS_PROVIDER_OPTIONS = [
  { value: 'edge-tts', label: 'Edge TTS gratuito' },
  { value: 'windows-sapi', label: 'Windows SAPI locale' },
];

const TTS_VOICE_OPTIONS: VoiceOption[] = [
  { value: 'it-IT-ElsaNeural', label: 'Elsa Neural', provider: 'edge-tts' },
  { value: 'it-IT-IsabellaNeural', label: 'Isabella Neural', provider: 'edge-tts' },
  { value: 'Microsoft Elsa Desktop', label: 'Microsoft Elsa Desktop', provider: 'windows-sapi' },
  { value: 'Microsoft Elsa', label: 'Microsoft Elsa', provider: 'windows-sapi' },
];

const SUGGESTION_CHIPS = [
  'Spiega come funziona un Transformer',
  'Scrivi un\'API REST in Kotlin con Ktor',
  'Cos\'e il pattern ReAct negli agenti AI?',
  'Crea uno script Python per analizzare un CSV',
];

const TEXT_FILE_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'json', 'js', 'jsx', 'ts', 'tsx', 'py', 'kt', 'kts', 'java', 'xml', 'yaml', 'yml',
  'csv', 'log', 'ini', 'cfg', 'conf', 'html', 'css', 'scss', 'sql', 'sh', 'ps1', 'bat', 'env', 'gitignore',
]);

const IMAGE_FILE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp']);

const DRAFT_FILE_OPTIONS: DraftFileOption[] = [
  { value: 'txt', label: 'Documento testo (.txt)', extension: 'txt', mimeType: 'text/plain;charset=utf-8', mode: 'text' },
  { value: 'md', label: 'Documento markdown (.md)', extension: 'md', mimeType: 'text/markdown;charset=utf-8', mode: 'text' },
  { value: 'json', label: 'JSON (.json)', extension: 'json', mimeType: 'application/json;charset=utf-8', mode: 'text' },
  { value: 'js', label: 'JavaScript (.js)', extension: 'js', mimeType: 'text/javascript;charset=utf-8', mode: 'text' },
  { value: 'ts', label: 'TypeScript (.ts)', extension: 'ts', mimeType: 'text/typescript;charset=utf-8', mode: 'text' },
  { value: 'py', label: 'Python (.py)', extension: 'py', mimeType: 'text/x-python;charset=utf-8', mode: 'text' },
  { value: 'html', label: 'HTML (.html)', extension: 'html', mimeType: 'text/html;charset=utf-8', mode: 'text' },
  { value: 'docx', label: 'Documento Word (.docx)', extension: 'docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', mode: 'docx' },
  { value: 'pdf', label: 'PDF (.pdf)', extension: 'pdf', mimeType: 'application/pdf', mode: 'pdf' },
];

const FILE_PICKER_ACCEPT = [
  '.txt,.md,.markdown,.json,.js,.jsx,.ts,.tsx,.py,.kt,.kts,.java,.xml,.yaml,.yml,.csv,.log,.ini,.cfg,.conf,.html,.css,.scss,.sql,.sh,.ps1,.bat',
  '.pdf,.docx,.doc',
  '.png,.jpg,.jpeg,.webp,.gif,.bmp',
].join(',');

const DEFAULT_DRAFT_FILE: DraftFileState = {
  fileName: 'gemcode-note.md',
  format: 'md',
  content: '# GemCode\n\nScrivi qui appunti, codice o documentazione.',
};

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

function loadStoredSettings(): AppSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function getFileExtension(name: string): string {
  const cleanName = name.toLowerCase().trim();
  const lastDot = cleanName.lastIndexOf('.');
  return lastDot >= 0 ? cleanName.slice(lastDot + 1) : '';
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function stripDataUrlPrefix(dataUrl: string): string {
  const commaIndex = dataUrl.indexOf(',');
  return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
}

function ensureExtension(fileName: string, extension: string): string {
  const trimmed = fileName.trim() || `gemcode-file.${extension}`;
  return trimmed.toLowerCase().endsWith(`.${extension}`) ? trimmed : `${trimmed}.${extension}`;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error(`Impossibile leggere ${file.name}`));
    reader.readAsDataURL(file);
  });
}

async function extractPdfText(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await getDocument({ data: bytes }).promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const lines = content.items
      .map(item => ('str' in item ? String(item.str) : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (lines) pages.push(lines);
  }

  return pages.join('\n\n').trim().slice(0, 12000);
}

async function extractDocxText(file: File): Promise<string> {
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return result.value.replace(/\n{3,}/g, '\n\n').trim().slice(0, 12000);
}

async function readAttachmentFile(file: File): Promise<ChatAttachment> {
  const extension = getFileExtension(file.name);
  const base: ChatAttachment = {
    id: `${file.name}-${file.size}-${file.lastModified}`,
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    kind: 'binary',
    extractedText: '',
    previewText: '',
  };

  try {
    if (file.type.startsWith('image/') || IMAGE_FILE_EXTENSIONS.has(extension)) {
      const imageDataUrl = await fileToDataUrl(file);
      return {
        ...base,
        kind: 'image',
        imageDataUrl,
        previewText: `Immagine ${file.name} · ${formatBytes(file.size)}`,
      };
    }

    if (file.type === 'application/pdf' || extension === 'pdf') {
      const extractedText = await extractPdfText(file);
      return {
        ...base,
        kind: 'pdf',
        extractedText,
        previewText: extractedText || `PDF ${file.name} senza testo estraibile`,
      };
    }

    if (
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      extension === 'docx'
    ) {
      const extractedText = await extractDocxText(file);
      return {
        ...base,
        kind: 'docx',
        extractedText,
        previewText: extractedText || `DOCX ${file.name} senza testo estraibile`,
      };
    }

    if (TEXT_FILE_EXTENSIONS.has(extension) || file.type.startsWith('text/')) {
      const extractedText = (await file.text()).slice(0, 12000);
      return {
        ...base,
        kind: 'text',
        extractedText,
        previewText: extractedText || `${file.name} vuoto`,
      };
    }

    if (extension === 'doc') {
      return {
        ...base,
        kind: 'binary',
        previewText: `${file.name} e un DOC legacy. Converti in DOCX per estrarre il testo nel browser.`,
        error: 'Formato DOC legacy non supportato direttamente dal browser.',
      };
    }

    return {
      ...base,
      kind: 'binary',
      previewText: `${file.name} importato come file binario (${formatBytes(file.size)}).`,
      error: 'Il browser puo allegarlo solo come riferimento, non leggerne il contenuto.',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ...base,
      previewText: `Errore lettura ${file.name}: ${message}`,
      error: message,
    };
  }
}

function buildAttachmentPrompt(attachment: ChatAttachment): string {
  const header = `File allegato: ${attachment.name} (${attachment.mimeType || 'n/d'}, ${formatBytes(attachment.size)})`;
  if (attachment.kind === 'image') {
    return `${header}\nTipo: immagine. Se il modello supporta input visivo usa anche l'immagine allegata; altrimenti ragiona solo sui metadati.`;
  }
  if (attachment.extractedText) {
    return `${header}\nContenuto estratto:\n${attachment.extractedText}`;
  }
  if (attachment.error) {
    return `${header}\nNota: ${attachment.error}`;
  }
  return `${header}\nNota: contenuto non disponibile.`;
}

function buildDisplayText(userText: string, attachments: ChatAttachment[]): string {
  const lines: string[] = [];
  if (attachments.length > 0) {
    lines.push(`Allegati: ${attachments.map(attachment => attachment.name).join(', ')}`);
  }
  if (userText.trim()) {
    lines.push(userText.trim());
  }
  return lines.join('\n');
}

function buildPromptText(userText: string, attachments: ChatAttachment[]): string {
  const trimmed = userText.trim();
  const blocks = attachments.map(buildAttachmentPrompt);
  if (trimmed) blocks.push(`Richiesta utente:\n${trimmed}`);
  return blocks.join('\n\n').trim();
}

function extractMessageImages(attachments?: ChatAttachment[]): string[] {
  return (attachments ?? [])
    .filter(attachment => attachment.imageDataUrl)
    .map(attachment => stripDataUrlPrefix(attachment.imageDataUrl!));
}

async function buildDraftBlob(draft: DraftFileState): Promise<{ fileName: string; blob: Blob }> {
  const option = DRAFT_FILE_OPTIONS.find(entry => entry.value === draft.format) ?? DRAFT_FILE_OPTIONS[0];
  const fileName = ensureExtension(draft.fileName, option.extension);
  const content = draft.content;

  if (option.mode === 'docx') {
    const paragraphs = content.split(/\r?\n/).map(line => new Paragraph({ children: [new TextRun(line)] }));
    const doc = new DocxDocument({ sections: [{ children: paragraphs.length > 0 ? paragraphs : [new Paragraph('')] }] });
    const blob = await Packer.toBlob(doc);
    return { fileName, blob };
  }

  if (option.mode === 'pdf') {
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
    const margin = 48;
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const maxWidth = pageWidth - margin * 2;
    const lines = pdf.splitTextToSize(content || ' ', maxWidth);
    let cursorY = margin;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    lines.forEach((line: string) => {
      if (cursorY > pageHeight - margin) {
        pdf.addPage();
        cursorY = margin;
      }
      pdf.text(line, margin, cursorY);
      cursorY += 16;
    });
    return { fileName, blob: pdf.output('blob') };
  }

  return { fileName, blob: new Blob([content], { type: option.mimeType }) };
}

function triggerBlobDownload(fileName: string, blob: Blob): void {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

async function* ollamaStream(
  host: string,
  model: string,
  messages: { role: string; content: string; images?: string[] }[],
  temperature: number,
  signal: AbortSignal
): AsyncGenerator<string> {
  const url = `${host.replace(/\/$/, '')}/api/chat`;

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: true, options: { temperature } }),
      signal,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Impossibile raggiungere Ollama su ${host}. ` +
        'Assicurati che Ollama sia in esecuzione (`ollama serve`) e ' +
        `che il modello "${model}" sia scaricato (\`ollama pull ${model}\`). Dettaglio: ${msg}`
    );
  }

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Ollama HTTP ${resp.status}: ${body}`);
  }

  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const json = JSON.parse(line);
        const token: string = json?.message?.content ?? '';
        if (token) yield token;
        if (json.done) return;
      } catch {
        // Ignora linee malformate.
      }
    }
  }
}

async function checkOllamaStatus(host: string): Promise<'online' | 'offline'> {
  try {
    const resp = await fetch(`${host.replace(/\/$/, '')}/api/tags`, { signal: AbortSignal.timeout(2000) });
    return resp.ok ? 'online' : 'offline';
  } catch {
    return 'offline';
  }
}

async function checkBridgeStatus(bridgeUrl: string): Promise<Reachability> {
  try {
    const resp = await fetch(`${bridgeUrl.replace(/\/$/, '')}/health`, { signal: AbortSignal.timeout(2000) });
    return resp.ok ? 'online' : 'offline';
  } catch {
    return 'offline';
  }
}

async function fetchBridgeSettings(bridgeUrl: string): Promise<VoiceBridgeSettings> {
  const resp = await fetch(`${bridgeUrl.replace(/\/$/, '')}/api/settings`, { signal: AbortSignal.timeout(4000) });
  if (!resp.ok) throw new Error(`Bridge HTTP ${resp.status}`);
  return { ...DEFAULT_VOICE_BRIDGE_SETTINGS, ...(await resp.json()) };
}

async function saveBridgeSettings(bridgeUrl: string, config: VoiceBridgeSettings): Promise<VoiceBridgeSettings> {
  const resp = await fetch(`${bridgeUrl.replace(/\/$/, '')}/api/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
    signal: AbortSignal.timeout(5000),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Salvataggio bridge fallito (${resp.status}): ${body}`);
  }
  return { ...DEFAULT_VOICE_BRIDGE_SETTINGS, ...(await resp.json()) };
}

async function fetchVoiceDeviceStatus(bridgeUrl: string, deviceId: string): Promise<VoiceDeviceStatus | null> {
  const resp = await fetch(
    `${bridgeUrl.replace(/\/$/, '')}/api/device/status?device_id=${encodeURIComponent(deviceId)}`,
    { signal: AbortSignal.timeout(4000) }
  );
  if (!resp.ok) return null;
  return await resp.json();
}

async function fetchBridgeHealth(bridgeUrl: string): Promise<BridgeHealthSnapshot> {
  const resp = await fetch(`${bridgeUrl.replace(/\/$/, '')}/api/bridge/health`, {
    signal: AbortSignal.timeout(4000),
  });
  if (!resp.ok) throw new Error(`Bridge health HTTP ${resp.status}`);
  return await resp.json();
}

async function fetchModelOptions(baseUrl: string): Promise<ModelOption[]> {
  const resp = await fetch(`${baseUrl.replace(/\/$/, '')}/api/tags`, {
    signal: AbortSignal.timeout(4000),
  });
  if (!resp.ok) throw new Error(`Model tags HTTP ${resp.status}`);
  const data = await resp.json();
  const models = Array.isArray(data?.models) ? data.models : [];
  return models
    .map((model: any) => ({
      name: String(model?.name ?? model?.model ?? ''),
      family: model?.details?.family ? String(model.details.family) : undefined,
      parameterSize: model?.details?.parameter_size ? String(model.details.parameter_size) : undefined,
      quantization: model?.details?.quantization_level ? String(model.details.quantization_level) : undefined,
    }))
    .filter((model: ModelOption) => model.name);
}

function toChatEndpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}/api/chat`;
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ollamaStatus, setOllamaStatus] = useState<'online' | 'offline' | 'checking'>('checking');
  const [voiceBridgeStatus, setVoiceBridgeStatus] = useState<Reachability>('checking');
  const [voiceBridgeSettings, setVoiceBridgeSettings] = useState<VoiceBridgeSettings>(DEFAULT_VOICE_BRIDGE_SETTINGS);
  const [voiceDeviceStatus, setVoiceDeviceStatus] = useState<VoiceDeviceStatus | null>(null);
  const [bridgeHealth, setBridgeHealth] = useState<BridgeHealthSnapshot | null>(null);
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([]);
  const [voiceSettingsDirty, setVoiceSettingsDirty] = useState(false);
  const [voiceSettingsMessage, setVoiceSettingsMessage] = useState<string | null>(null);
  const [isSavingVoiceSettings, setIsSavingVoiceSettings] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [workspaceFiles, setWorkspaceFiles] = useState<ChatAttachment[]>([]);
  const [workspaceMessage, setWorkspaceMessage] = useState<string | null>(null);
  const [isImportingFiles, setIsImportingFiles] = useState(false);
  const [draftFile, setDraftFile] = useState<DraftFileState>(DEFAULT_DRAFT_FILE);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setSettings(loadStoredSettings());
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    setOllamaStatus('checking');
    checkOllamaStatus(settings.ollamaHost).then(setOllamaStatus);
  }, [settings.ollamaHost]);

  useEffect(() => {
    let cancelled = false;

    async function refreshModels() {
      try {
        const models = await fetchModelOptions(settings.ollamaHost);
        if (!cancelled) setModelOptions(models);
      } catch {
        if (!cancelled) setModelOptions([]);
      }
    }

    refreshModels();
    return () => {
      cancelled = true;
    };
  }, [settings.ollamaHost]);

  useEffect(() => {
    let cancelled = false;

    async function refreshBridgeData() {
      const bridgeState = await checkBridgeStatus(settings.bridgeUrl);
      if (cancelled) return;
      setVoiceBridgeStatus(bridgeState);

      if (bridgeState !== 'online') {
        setVoiceDeviceStatus(null);
        setBridgeHealth(null);
        return;
      }

      try {
        const [bridgeConfig, deviceStatus, health] = await Promise.all([
          fetchBridgeSettings(settings.bridgeUrl),
          fetchVoiceDeviceStatus(settings.bridgeUrl, settings.voiceDeviceId),
          fetchBridgeHealth(settings.bridgeUrl),
        ]);

        if (cancelled) return;
        if (!voiceSettingsDirty) setVoiceBridgeSettings(bridgeConfig);
        setVoiceDeviceStatus(deviceStatus);
        setBridgeHealth(health);
      } catch {
        if (!cancelled) {
          setVoiceBridgeStatus('offline');
          setBridgeHealth(null);
        }
      }
    }

    refreshBridgeData();
    const intervalId = window.setInterval(refreshBridgeData, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [settings.bridgeUrl, settings.voiceDeviceId, voiceSettingsDirty]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
  };

  const updateVoiceBridgeSettings = <K extends keyof VoiceBridgeSettings>(key: K, value: VoiceBridgeSettings[K]) => {
    setVoiceBridgeSettings(prev => ({ ...prev, [key]: value }));
    setVoiceSettingsDirty(true);
    setVoiceSettingsMessage(null);
  };

  const availableTtsVoices = TTS_VOICE_OPTIONS.filter(option => option.provider === voiceBridgeSettings.tts_provider);

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const importFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    setIsImportingFiles(true);
    setWorkspaceMessage(null);

    try {
      const parsed = await Promise.all(Array.from(fileList).map(file => readAttachmentFile(file)));
      setPendingAttachments(prev => {
        const known = new Set(prev.map(item => item.id));
        const next = [...prev];
        parsed.forEach(item => {
          if (!known.has(item.id)) next.push(item);
        });
        return next;
      });
      setWorkspaceFiles(prev => {
        const merged = [...parsed, ...prev.filter(existing => !parsed.some(item => item.id === existing.id))];
        return merged.slice(0, 16);
      });
      const failed = parsed.filter(item => item.error).length;
      setWorkspaceMessage(
        failed > 0
          ? `${parsed.length} file importati, ${failed} con limitazioni di lettura.`
          : `${parsed.length} file importati nel toolkit e pronti per la chat.`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setWorkspaceMessage(`Import fallito: ${msg}`);
    } finally {
      setIsImportingFiles(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, []);

  const removeAttachment = useCallback((attachmentId: string) => {
    setPendingAttachments(prev => prev.filter(item => item.id !== attachmentId));
  }, []);

  const enqueueWorkspaceFile = useCallback((attachmentId: string) => {
    const candidate = workspaceFiles.find(item => item.id === attachmentId);
    if (!candidate) return;
    setPendingAttachments(prev => (prev.some(item => item.id === candidate.id) ? prev : [...prev, candidate]));
    setWorkspaceMessage(`Aggiunto in chat: ${candidate.name}`);
  }, [workspaceFiles]);

  const copyWorkspaceText = useCallback(async (attachmentId: string) => {
    const candidate = workspaceFiles.find(item => item.id === attachmentId);
    if (!candidate?.extractedText) return;
    await navigator.clipboard.writeText(candidate.extractedText);
    setWorkspaceMessage(`Testo copiato: ${candidate.name}`);
  }, [workspaceFiles]);

  const exportDraft = useCallback(async () => {
    try {
      const { fileName, blob } = await buildDraftBlob(draftFile);
      triggerBlobDownload(fileName, blob);
      setWorkspaceMessage(`Creato file locale: ${fileName}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setWorkspaceMessage(`Creazione file fallita: ${msg}`);
    }
  }, [draftFile]);

  const reloadVoiceBridgeSettings = useCallback(async () => {
    setVoiceSettingsMessage(null);
    try {
      const [bridgeConfig, deviceStatus, health] = await Promise.all([
        fetchBridgeSettings(settings.bridgeUrl),
        fetchVoiceDeviceStatus(settings.bridgeUrl, settings.voiceDeviceId),
        fetchBridgeHealth(settings.bridgeUrl),
      ]);
      setVoiceBridgeSettings(bridgeConfig);
      setVoiceDeviceStatus(deviceStatus);
      setBridgeHealth(health);
      setVoiceSettingsDirty(false);
      setVoiceSettingsMessage('Impostazioni ricaricate dal bridge');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setVoiceSettingsMessage(`Ricarica fallita: ${msg}`);
    }
  }, [settings.bridgeUrl, settings.voiceDeviceId]);

  const saveUnifiedPortalConfig = useCallback(async () => {
    setIsSavingVoiceSettings(true);
    setVoiceSettingsMessage(null);
    try {
      const updated = await saveBridgeSettings(settings.bridgeUrl, {
        ...voiceBridgeSettings,
        agent_url: toChatEndpoint(settings.ollamaHost),
        model: settings.ollamaModel,
        system_prompt: settings.systemPrompt,
        temperature: settings.temperature,
        device_id: settings.voiceDeviceId,
      });
      setVoiceBridgeSettings(updated);
      setVoiceSettingsDirty(false);
      setVoiceSettingsMessage('Profilo condiviso sincronizzato su portale e bridge');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setVoiceSettingsMessage(`Sincronizzazione fallita: ${msg}`);
    } finally {
      setIsSavingVoiceSettings(false);
    }
  }, [settings, voiceBridgeSettings]);

  const saveVoiceBridgeConfig = useCallback(async () => {
    setIsSavingVoiceSettings(true);
    setVoiceSettingsMessage(null);
    try {
      const updated = await saveBridgeSettings(settings.bridgeUrl, voiceBridgeSettings);
      setVoiceBridgeSettings(updated);
      setSettings(prev => ({ ...prev, voiceDeviceId: updated.device_id }));
      setVoiceSettingsDirty(false);
      setVoiceSettingsMessage('Impostazioni bridge salvate');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setVoiceSettingsMessage(`Salvataggio fallito: ${msg}`);
    } finally {
      setIsSavingVoiceSettings(false);
    }
  }, [settings.bridgeUrl, voiceBridgeSettings]);

  const newChat = useCallback(() => {
    if (messages.length > 0) {
      setConversations(prev => [
        { id: Date.now().toString(), title: messages[0].text.slice(0, 45), timestamp: new Date() },
        ...prev.slice(0, 19),
      ]);
    }
    setMessages([]);
    setError(null);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    const outgoingAttachments = [...pendingAttachments];
    if ((!trimmed && outgoingAttachments.length === 0) || isLoading) return;

    setError(null);
    setInput('');
    setPendingAttachments([]);
    if (inputRef.current) inputRef.current.style.height = 'auto';

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: buildDisplayText(trimmed, outgoingAttachments),
      apiText: buildPromptText(trimmed, outgoingAttachments),
      attachments: outgoingAttachments,
    };
    const modelId = `m-${Date.now()}`;
    const modelMsg: Message = { id: modelId, role: 'model', text: '', isStreaming: true };

    setMessages(prev => [...prev, userMsg, modelMsg]);
    setIsLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const history = [...messages, userMsg].map(m => ({
        role: m.role === 'model' ? 'assistant' : 'user',
        content: m.role === 'user' ? m.apiText ?? m.text : m.text,
        ...(m.role === 'user' && extractMessageImages(m.attachments).length > 0
          ? { images: extractMessageImages(m.attachments) }
          : {}),
      }));

      let gen: AsyncGenerator<string>;

      gen = ollamaStream(
        settings.ollamaHost,
        settings.ollamaModel,
        [{ role: 'system', content: settings.systemPrompt }, ...history],
        settings.temperature,
        controller.signal
      );

      let accumulated = '';
      for await (const token of gen) {
        if (controller.signal.aborted) break;
        accumulated += token;
        setMessages(prev => prev.map(m => (m.id === modelId ? { ...m, text: accumulated } : m)));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessages(prev => prev.filter(m => m.id !== modelId));
      setError(msg);
    } finally {
      setIsLoading(false);
      setMessages(prev => prev.map(m => (m.id === modelId ? { ...m, isStreaming: false } : m)));
      abortRef.current = null;
    }
  }, [isLoading, messages, pendingAttachments, settings]);

  const stopGeneration = () => {
    abortRef.current?.abort();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const activeBackendLabel = `${settings.ollamaModel} · Profilo condiviso`;

  return (
    <div className="flex h-screen bg-base text-primary overflow-hidden">
      <AnimatePresence initial={false}>
        {sidebarOpen && (
          <motion.aside
            key="sidebar"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 260, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col bg-surface border-r border-border overflow-hidden shrink-0"
          >
            <div className="flex items-center gap-3 px-4 py-5 border-b border-border">
              <GemcodeLogo />
              <span className="font-semibold text-primary text-base tracking-tight">GemCode</span>
            </div>

            <div className="px-3 py-3">
              <button
                onClick={newChat}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-secondary hover:bg-elevated hover:text-primary transition-colors"
              >
                <Plus className="w-4 h-4 shrink-0" />
                Nuova chat
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-0.5">
              {conversations.length > 0 && (
                <p className="px-3 py-2 text-xs font-medium text-muted uppercase tracking-wider">Recenti</p>
              )}
              {conversations.map(conv => (
                <div
                  key={conv.id}
                  className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-sm text-secondary hover:bg-elevated/60 hover:text-primary cursor-default transition-colors"
                >
                  <MessageSquare className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted" />
                  <span className="truncate leading-snug">{conv.title}</span>
                </div>
              ))}
              {conversations.length === 0 && (
                <p className="px-3 py-4 text-xs text-muted text-center">Le conversazioni appariranno qui</p>
              )}
            </div>

            <div className="border-t border-border px-3 py-3 space-y-1.5">
              <div className="px-3 py-2 flex items-center gap-2 text-xs text-muted">
                <BackendStatusDot ollamaStatus={ollamaStatus} />
                <span className="truncate">{activeBackendLabel}</span>
              </div>
              <div className="px-3 py-2 flex items-center gap-2 text-xs text-muted">
                {voiceDeviceStatus?.status === 'online' ? (
                  <Wifi className="w-3.5 h-3.5 text-green-400 shrink-0" />
                ) : (
                  <WifiOff className="w-3.5 h-3.5 text-red-400 shrink-0" />
                )}
                <span className="truncate">
                  {voiceDeviceStatus?.device_name ?? settings.voiceDeviceId} · {voiceDeviceStatus?.status ?? 'sconosciuto'}
                </span>
              </div>
              <button
                onClick={() => setSettingsOpen(true)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-secondary hover:bg-elevated hover:text-primary transition-colors"
              >
                <Settings className="w-4 h-4 shrink-0" />
                Impostazioni
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface/80 backdrop-blur shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(v => !v)}
              className="p-2 rounded-lg text-secondary hover:bg-elevated hover:text-primary transition-colors"
            >
              {sidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
            {!sidebarOpen && <GemcodeLogo />}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSettingsOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-elevated border border-border text-xs font-medium text-secondary hover:text-primary hover:border-accent/50 transition-colors"
            >
              <BackendStatusDot ollamaStatus={ollamaStatus} />
              {activeBackendLabel}
            </button>
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-elevated border border-border text-xs font-medium text-secondary">
              {voiceDeviceStatus?.status === 'online' ? (
                <Wifi className="w-3.5 h-3.5 text-green-400" />
              ) : (
                <WifiOff className="w-3.5 h-3.5 text-red-400" />
              )}
              <span>{voiceDeviceStatus?.status === 'online' ? 'Dispositivo attivo' : 'Dispositivo offline'}</span>
            </div>
            {messages.length > 0 && (
              <button
                onClick={newChat}
                className="p-2 rounded-lg text-secondary hover:bg-elevated hover:text-primary transition-colors"
                title="Nuova chat"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <WelcomeScreen onSuggestion={sendMessage} />
          ) : (
            <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
              {messages.map(msg => <MessageBubble key={msg.id} message={msg} />)}
              {error && <ErrorBanner message={error} />}
              <div ref={messagesEndRef} />
            </div>
          )}
        </main>

        {error && messages.length === 0 && (
          <div className="max-w-3xl mx-auto w-full px-4 pb-2">
            <ErrorBanner message={error} />
          </div>
        )}

        <div className="shrink-0 px-4 pb-6 pt-2">
          <div className="max-w-3xl mx-auto">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={FILE_PICKER_ACCEPT}
              onChange={e => {
                void importFiles(e.target.files);
              }}
              className="hidden"
            />
            {pendingAttachments.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {pendingAttachments.map(attachment => (
                  <AttachmentChip key={attachment.id} attachment={attachment} onRemove={removeAttachment} />
                ))}
              </div>
            )}
            <div className="relative flex items-end gap-3 bg-elevated border border-border rounded-2xl px-4 py-3 focus-within:border-accent/50 transition-colors shadow-sm">
              <button
                onClick={openFilePicker}
                disabled={isLoading || isImportingFiles}
                className="p-2 rounded-xl border border-border text-secondary hover:text-primary hover:border-accent/40 disabled:opacity-40 transition-colors"
                title="Allega immagini, PDF, DOCX o codice"
              >
                <FileText className="w-4 h-4" />
              </button>
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Scrivi un messaggio..."
                rows={1}
                className="flex-1 bg-transparent resize-none text-sm text-primary placeholder:text-muted focus:outline-none leading-relaxed max-h-48"
                disabled={isLoading}
              />
              <div className="flex items-center shrink-0 pb-0.5">
                {isLoading ? (
                  <button
                    onClick={stopGeneration}
                    className="p-2 rounded-xl bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
                    title="Interrompi"
                  >
                    <div className="w-3.5 h-3.5 rounded-sm bg-accent" />
                  </button>
                ) : (
                  <button
                    onClick={() => sendMessage(input)}
                    disabled={!input.trim() && pendingAttachments.length === 0}
                    className="p-2 rounded-xl bg-accent text-white hover:bg-accent-hover disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    title="Invia (Enter)"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted">
              <span>
                {isImportingFiles
                  ? 'Import dei file in corso...'
                  : pendingAttachments.length > 0
                    ? `${pendingAttachments.length} allegati pronti per l'invio`
                    : 'Chat testuale o multimodale con allegati locali'}
              </span>
              <button
                onClick={openFilePicker}
                className="text-accent hover:text-accent-hover transition-colors"
              >
                Apri file dal PC
              </button>
            </div>
            <p className="text-center text-xs text-muted mt-2">
              GemCode · {activeBackendLabel} · Bridge voce {voiceBridgeStatus} · Dispositivo {voiceDeviceStatus?.status ?? 'unknown'}
            </p>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {settingsOpen && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-40"
              onClick={() => setSettingsOpen(false)}
            />
            <motion.div
              key="panel"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="fixed right-0 top-0 h-full w-[28rem] bg-surface border-l border-border z-50 flex flex-col shadow-2xl"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <h2 className="font-semibold text-primary">Impostazioni GemCode</h2>
                <button
                  onClick={() => setSettingsOpen(false)}
                  className="p-1.5 rounded-lg text-secondary hover:bg-elevated hover:text-primary transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
                <SettingsSection icon={<Cpu className="w-4 h-4" />} title="Profilo LLM condiviso">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between rounded-xl border border-border bg-elevated/40 px-3 py-3 text-sm">
                      <div>
                        <p className="text-primary font-medium">Backend unico del portale</p>
                        <p className="text-xs text-muted">La chat web e i dispositivi voce usano lo stesso profilo</p>
                      </div>
                      <StatusBadge status={ollamaStatus === 'online' ? 'ok' : ollamaStatus === 'offline' ? 'error' : 'checking'} label={ollamaStatus === 'online' ? 'online' : ollamaStatus === 'offline' ? 'offline' : 'checking'} />
                    </div>
                    <TextField
                      label="Host LLM condiviso"
                      value={settings.ollamaHost}
                      onChange={value => setSettings(s => ({ ...s, ollamaHost: value }))}
                      placeholder="http://localhost:11434"
                    />
                    <div>
                      <label className="text-xs text-muted mb-1.5 block">Modello condiviso</label>
                      <select
                        value={settings.ollamaModel}
                        onChange={e => setSettings(s => ({ ...s, ollamaModel: e.target.value }))}
                        className="w-full bg-elevated border border-border rounded-xl px-3 py-2 text-sm text-primary focus:border-accent/50 focus:outline-none transition-colors"
                      >
                        {modelOptions.length === 0 ? (
                          <option value={settings.ollamaModel}>{settings.ollamaModel}</option>
                        ) : (
                          modelOptions.map(model => (
                            <option key={model.name} value={model.name}>
                              {model.name}
                            </option>
                          ))
                        )}
                      </select>
                      {modelOptions.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {modelOptions.map(model => (
                            <span key={model.name} className="rounded-full border border-border px-2 py-1 text-[11px] text-secondary">
                              {model.name}
                              {model.family ? ` · ${model.family}` : ''}
                              {model.parameterSize ? ` · ${model.parameterSize}` : ''}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <RangeField
                      label="Temperatura condivisa"
                      min={0}
                      max={1}
                      step={0.05}
                      value={settings.temperature}
                      onChange={value => setSettings(s => ({ ...s, temperature: value }))}
                    />
                    <div>
                      <label className="text-xs text-muted mb-1.5 block">System prompt condiviso</label>
                      <textarea
                        value={settings.systemPrompt}
                        onChange={e => setSettings(s => ({ ...s, systemPrompt: e.target.value }))}
                        rows={6}
                        className="w-full bg-elevated border border-border rounded-xl px-3 py-2.5 text-xs text-secondary focus:text-primary focus:border-accent/50 focus:outline-none resize-none leading-relaxed transition-colors"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={reloadVoiceBridgeSettings}
                        className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-border text-sm text-secondary hover:bg-elevated hover:text-primary transition-colors"
                      >
                        <RefreshCw className="w-4 h-4" />
                        Ricarica stato
                      </button>
                      <button
                        onClick={saveUnifiedPortalConfig}
                        disabled={isSavingVoiceSettings || voiceBridgeStatus !== 'online'}
                        className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-accent text-white disabled:opacity-40 transition-colors"
                      >
                        <Save className="w-4 h-4" />
                        {isSavingVoiceSettings ? 'Sincronizzo...' : 'Applica a tutti'}
                      </button>
                    </div>
                    {voiceSettingsMessage && (
                      <div className="rounded-xl bg-accent/10 border border-accent/20 px-3 py-2 text-xs text-accent">
                        {voiceSettingsMessage}
                      </div>
                    )}
                  </div>
                </SettingsSection>

                <SettingsSection icon={<Boxes className="w-4 h-4" />} title="Dispositivi collegati">
                  <DeviceFleetCard
                    devices={bridgeHealth?.devices ?? []}
                    selectedDeviceId={settings.voiceDeviceId}
                    onSelect={deviceId => setSettings(s => ({ ...s, voiceDeviceId: deviceId }))}
                  />
                </SettingsSection>

                <SettingsSection icon={<FileText className="w-4 h-4" />} title="Toolkit file PC">
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <button
                        onClick={openFilePicker}
                        disabled={isImportingFiles}
                        className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-border text-sm text-secondary hover:bg-elevated hover:text-primary disabled:opacity-40 transition-colors"
                      >
                        <FileText className="w-4 h-4" />
                        {isImportingFiles ? 'Import...' : 'Leggi file locali'}
                      </button>
                      <button
                        onClick={exportDraft}
                        className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-accent text-white transition-colors"
                      >
                        <Save className="w-4 h-4" />
                        Crea file
                      </button>
                    </div>

                    {workspaceMessage && (
                      <div className="rounded-xl bg-accent/10 border border-accent/20 px-3 py-2 text-xs text-accent">
                        {workspaceMessage}
                      </div>
                    )}

                    <div className="rounded-2xl border border-border bg-elevated/30 p-4 space-y-3">
                      <TextField
                        label="Nome file"
                        value={draftFile.fileName}
                        onChange={value => setDraftFile(prev => ({ ...prev, fileName: value }))}
                        placeholder="gemcode-note.md"
                      />
                      <div>
                        <label className="text-xs text-muted mb-1.5 block">Formato output</label>
                        <select
                          value={draftFile.format}
                          onChange={e => setDraftFile(prev => ({ ...prev, format: e.target.value as DraftFormat }))}
                          className="w-full bg-elevated border border-border rounded-xl px-3 py-2 text-sm text-primary focus:border-accent/50 focus:outline-none transition-colors"
                        >
                          {DRAFT_FILE_OPTIONS.map(option => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-muted mb-1.5 block">Contenuto</label>
                        <textarea
                          value={draftFile.content}
                          onChange={e => setDraftFile(prev => ({ ...prev, content: e.target.value }))}
                          rows={8}
                          className="w-full bg-elevated border border-border rounded-xl px-3 py-2.5 text-xs text-secondary focus:text-primary focus:border-accent/50 focus:outline-none resize-y leading-relaxed transition-colors"
                        />
                      </div>
                      <p className="text-[11px] text-muted">
                        Supporta esportazione locale di documenti, codice, DOCX e PDF direttamente dal browser.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-primary">File letti nel browser</p>
                        <span className="text-xs text-muted">{workspaceFiles.length}</span>
                      </div>
                      {workspaceFiles.length === 0 ? (
                        <div className="rounded-xl border border-border bg-elevated/40 px-3 py-3 text-sm text-secondary">
                          Nessun file importato ancora. Usa "Leggi file locali" per immagini, PDF, DOCX o codice.
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-96 overflow-auto pr-1">
                          {workspaceFiles.map(file => (
                            <WorkspaceFileCard
                              key={file.id}
                              file={file}
                              inChat={pendingAttachments.some(item => item.id === file.id)}
                              onAddToChat={enqueueWorkspaceFile}
                              onCopyText={copyWorkspaceText}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </SettingsSection>

                <SettingsSection icon={<Radio className="w-4 h-4" />} title="Bridge voce GemCode">
                  <div className="space-y-3">
                    <TextField
                      label="URL bridge"
                      value={settings.bridgeUrl}
                      onChange={value => setSettings(s => ({ ...s, bridgeUrl: value }))}
                      placeholder="http://localhost:10301"
                    />
                    <div className="flex items-center justify-between rounded-xl border border-border bg-elevated/40 px-3 py-3 text-sm">
                      <div>
                        <p className="text-primary font-medium">Stato bridge</p>
                        <p className="text-xs text-muted">HTTP {settings.bridgeUrl}</p>
                      </div>
                      <StatusBadge status={voiceBridgeStatus === 'online' ? 'ok' : voiceBridgeStatus === 'offline' ? 'error' : 'checking'} label={voiceBridgeStatus} />
                    </div>
                    <InfoRow label="Device selezionato" value={settings.voiceDeviceId} />
                  </div>
                </SettingsSection>

                <SettingsSection icon={<Mic className="w-4 h-4" />} title="Dispositivo voce">
                  <DeviceStatusCard status={voiceDeviceStatus} />
                </SettingsSection>

                <SettingsSection icon={<RefreshCw className="w-4 h-4" />} title="Health e live logs">
                  <BridgeHealthCard snapshot={bridgeHealth} />
                </SettingsSection>

                <SettingsSection icon={<SlidersHorizontal className="w-4 h-4" />} title="Parametri voce specifici">
                  <div className="space-y-3">
                    <NumberField
                      label="Frasi massime risposta"
                      value={voiceBridgeSettings.max_response_sentences}
                      onChange={value => updateVoiceBridgeSettings('max_response_sentences', value)}
                      min={1}
                      max={4}
                    />
                    <NumberField
                      label="Caratteri massimi risposta"
                      value={voiceBridgeSettings.max_response_chars}
                      onChange={value => updateVoiceBridgeSettings('max_response_chars', value)}
                      min={80}
                      max={500}
                    />
                    <div>
                      <label className="text-xs text-muted mb-1.5 block">Provider TTS</label>
                      <select
                        value={voiceBridgeSettings.tts_provider}
                        onChange={e => {
                          const nextProvider = e.target.value;
                          const nextVoice = TTS_VOICE_OPTIONS.find(option => option.provider === nextProvider)?.value ?? voiceBridgeSettings.tts_voice;
                          setVoiceBridgeSettings(prev => ({ ...prev, tts_provider: nextProvider, tts_voice: nextVoice }));
                          setVoiceSettingsDirty(true);
                          setVoiceSettingsMessage(null);
                        }}
                        className="w-full bg-elevated border border-border rounded-xl px-3 py-2 text-sm text-primary focus:border-accent/50 focus:outline-none transition-colors"
                      >
                        {TTS_PROVIDER_OPTIONS.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted mb-1.5 block">Voce TTS</label>
                      <select
                        value={voiceBridgeSettings.tts_voice}
                        onChange={e => updateVoiceBridgeSettings('tts_voice', e.target.value)}
                        className="w-full bg-elevated border border-border rounded-xl px-3 py-2 text-sm text-primary focus:border-accent/50 focus:outline-none transition-colors"
                      >
                        {availableTtsVoices.length === 0 ? (
                          <option value={voiceBridgeSettings.tts_voice}>{voiceBridgeSettings.tts_voice}</option>
                        ) : (
                          availableTtsVoices.map(option => (
                            <option key={`${option.provider}:${option.value}`} value={option.value}>
                              {option.label}
                            </option>
                          ))
                        )}
                      </select>
                      <p className="mt-2 text-[11px] text-muted">
                        Default ripristinato: Edge TTS gratuito con Elsa Neural. Sono esposte solo voci femminili; Windows SAPI resta disponibile come fallback locale.
                      </p>
                    </div>
                    <TextField
                      label="Nome dispositivo"
                      value={voiceBridgeSettings.device_name}
                      onChange={value => updateVoiceBridgeSettings('device_name', value)}
                      placeholder="Home Assistant Voice PE"
                    />
                    <TextField
                      label="Modalita firmware"
                      value={voiceBridgeSettings.device_mode}
                      onChange={value => updateVoiceBridgeSettings('device_mode', value)}
                      placeholder="ptt o wake"
                    />
                    <TextField
                      label="Wake word desiderata"
                      value={voiceBridgeSettings.wake_word_label}
                      onChange={value => updateVoiceBridgeSettings('wake_word_label', value)}
                      placeholder="GEMMA"
                    />
                    <TextField
                      label="Modello wake word"
                      value={voiceBridgeSettings.wake_word_model}
                      onChange={value => updateVoiceBridgeSettings('wake_word_model', value)}
                      placeholder="URL o nome modello micro_wake_word"
                    />
                    <textarea
                      value={voiceBridgeSettings.wake_word_notes}
                      onChange={e => updateVoiceBridgeSettings('wake_word_notes', e.target.value)}
                      rows={3}
                      className="w-full bg-elevated border border-border rounded-xl px-3 py-2.5 text-xs text-secondary focus:text-primary focus:border-accent/50 focus:outline-none resize-none leading-relaxed transition-colors"
                    />
                    <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 px-3 py-2.5 text-xs text-amber-300">
                      Il modello, la temperatura e il system prompt della voce arrivano dal profilo condiviso. Qui restano solo le opzioni davvero specifiche del canale voce.
                    </div>
                  </div>
                </SettingsSection>

                <SettingsSection icon={<Shield className="w-4 h-4" />} title="Permessi agente">
                  <div className="space-y-1">
                    <p className="text-xs text-muted mb-3">
                      Controlla cosa l'agente può fare autonomamente. "Chiedi" mostrerà una conferma prima di ogni azione.
                    </p>
                    {PERMISSION_DESCRIPTORS.map(perm => (
                      <PermissionRow
                        key={perm.key}
                        descriptor={perm}
                        value={settings.agentPermissions[perm.key]}
                        onChange={value => setSettings(s => ({
                          ...s,
                          agentPermissions: { ...s.agentPermissions, [perm.key]: value },
                        }))}
                      />
                    ))}
                    <div className="flex gap-2 pt-3">
                      <button
                        onClick={() => setSettings(s => ({
                          ...s,
                          agentPermissions: Object.fromEntries(
                            Object.keys(s.agentPermissions).map(k => [k, 'allow'])
                          ) as AgentPermissions,
                        }))}
                        className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-green-500/30 text-xs text-green-400 hover:bg-green-500/10 transition-colors"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Accetta tutti
                      </button>
                      <button
                        onClick={() => setSettings(s => ({
                          ...s,
                          agentPermissions: Object.fromEntries(
                            Object.keys(s.agentPermissions).map(k => [k, 'ask'])
                          ) as AgentPermissions,
                        }))}
                        className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-amber-500/30 text-xs text-amber-400 hover:bg-amber-500/10 transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Chiedi tutti
                      </button>
                      <button
                        onClick={() => setSettings(s => ({
                          ...s,
                          agentPermissions: Object.fromEntries(
                            Object.keys(s.agentPermissions).map(k => [k, 'deny'])
                          ) as AgentPermissions,
                        }))}
                        className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-red-500/30 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <Lock className="w-3.5 h-3.5" />
                        Nega tutti
                      </button>
                    </div>
                    <button
                      onClick={() => setSettings(s => ({ ...s, agentPermissions: DEFAULT_PERMISSIONS }))}
                      className="w-full mt-2 px-3 py-2 rounded-xl border border-border text-xs text-secondary hover:bg-elevated hover:text-primary transition-colors"
                    >
                      Ripristina predefiniti sicuri
                    </button>
                  </div>
                </SettingsSection>

                <SettingsSection icon={<Info className="w-4 h-4" />} title="Informazioni">
                  <div className="space-y-2 text-xs text-secondary">
                    <InfoRow label="Portale web" value="http://localhost:3000" />
                    <InfoRow label="Bridge voce" value={settings.bridgeUrl} />
                    <InfoRow label="Voice device ID" value={settings.voiceDeviceId} />
                    <InfoRow label="Cloud API" value="Nessuna" />
                    <InfoRow label="Dati inviati" value="Solo locale" />
                  </div>
                </SettingsSection>

                <button
                  onClick={() => {
                    setSettings(DEFAULT_SETTINGS);
                    setVoiceBridgeSettings(DEFAULT_VOICE_BRIDGE_SETTINGS);
                    setVoiceSettingsDirty(true);
                    setVoiceSettingsMessage(null);
                  }}
                  className="w-full px-3 py-2.5 rounded-xl border border-border text-sm text-secondary hover:bg-elevated hover:text-primary transition-colors"
                >
                  Ripristina predefiniti locali
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function WelcomeScreen({ onSuggestion }: { onSuggestion: (s: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-4 py-12 select-none">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col items-center text-center max-w-xl"
      >
        <div className="mb-6"><GemcodeLogo size={48} /></div>
        <h1 className="text-3xl font-bold text-primary mb-2 tracking-tight">
          Ciao, come posso aiutarti?
        </h1>
        <p className="text-secondary text-base mb-10">
          AI locale · Chat web e bridge voce gestiti nello stesso pannello
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
          {SUGGESTION_CHIPS.map(chip => (
            <button
              key={chip}
              onClick={() => onSuggestion(chip)}
              className="text-left px-4 py-3.5 rounded-2xl border border-border bg-surface hover:bg-elevated hover:border-accent/40 transition-all text-sm text-secondary hover:text-primary leading-snug"
            >
              {chip}
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message; key?: string }) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  const copy = () => {
    navigator.clipboard.writeText(message.text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {!isUser && (
        <div className="shrink-0 mt-1 w-7 h-7 rounded-full bg-accent/15 border border-accent/20 flex items-center justify-center">
          <Sparkles className="w-3.5 h-3.5 text-accent" />
        </div>
      )}
      <div className={`group relative max-w-[80%] flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
            isUser
              ? 'bg-accent/15 border border-accent/20 text-primary rounded-tr-sm'
              : 'text-primary rounded-tl-sm'
          }`}
        >
          {message.text}
          {message.isStreaming && (
            <span className="inline-block w-2 h-4 ml-0.5 bg-accent/70 rounded-sm animate-pulse align-middle" />
          )}
        </div>
        {!message.isStreaming && message.text && (
          <button
            onClick={copy}
            className="opacity-0 group-hover:opacity-100 self-end flex items-center gap-1.5 text-xs text-muted hover:text-secondary transition-all px-1.5 py-0.5 rounded-md"
          >
            {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copiato' : 'Copia'}
          </button>
        )}
      </div>
    </motion.div>
  );
}

function AttachmentChip({
  attachment,
  onRemove,
}: {
  key?: React.Key;
  attachment: ChatAttachment;
  onRemove: (attachmentId: string) => void;
}) {
  const tone = attachment.error
    ? 'border-amber-400/30 bg-amber-400/10 text-amber-100'
    : attachment.kind === 'image'
      ? 'border-blue-400/30 bg-blue-400/10 text-blue-100'
      : 'border-border bg-surface text-secondary';

  return (
    <div className={`inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${tone}`}>
      <span className="truncate max-w-52">{attachment.name}</span>
      <span className="text-[10px] uppercase tracking-wide opacity-70">{attachment.kind}</span>
      <button
        onClick={() => onRemove(attachment.id)}
        className="rounded-full p-0.5 hover:bg-white/10 transition-colors"
        title={`Rimuovi ${attachment.name}`}
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

function WorkspaceFileCard({
  file,
  inChat,
  onAddToChat,
  onCopyText,
}: {
  key?: React.Key;
  file: ChatAttachment;
  inChat: boolean;
  onAddToChat: (attachmentId: string) => void;
  onCopyText: (attachmentId: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-elevated/30 p-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-primary truncate">{file.name}</p>
          <p className="text-xs text-muted">
            {file.kind} · {formatBytes(file.size)}
          </p>
        </div>
        <StatusBadge status={file.error ? 'checking' : 'ok'} label={file.error ? 'limitato' : 'ok'} />
      </div>

      {file.imageDataUrl ? (
        <img
          src={file.imageDataUrl}
          alt={file.name}
          className="w-full max-h-40 object-contain rounded-xl border border-border bg-surface"
        />
      ) : null}

      <div className="rounded-xl border border-border/70 bg-surface px-3 py-2">
        <p className="text-xs text-muted mb-1">Anteprima</p>
        <p className="text-xs text-secondary whitespace-pre-wrap break-words line-clamp-6">
          {file.previewText || 'Nessuna anteprima disponibile.'}
        </p>
      </div>

      {file.error && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs text-amber-200">
          {file.error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => onAddToChat(file.id)}
          className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-border text-xs text-secondary hover:bg-elevated hover:text-primary transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          {inChat ? 'Gia in chat' : 'Aggiungi alla chat'}
        </button>
        <button
          onClick={() => {
            void onCopyText(file.id);
          }}
          disabled={!file.extractedText}
          className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-border text-xs text-secondary hover:bg-elevated hover:text-primary disabled:opacity-30 transition-colors"
        >
          <Copy className="w-3.5 h-3.5" />
          Copia testo
        </button>
      </div>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-2xl px-4 py-3">
      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
      <span className="whitespace-pre-wrap">{message}</span>
    </div>
  );
}

function BackendStatusDot({
  ollamaStatus,
}: {
  ollamaStatus: 'online' | 'offline' | 'checking';
}) {
  const isOk = ollamaStatus === 'online';
  const isChecking = ollamaStatus === 'checking';

  return (
    <span
      className={`w-2 h-2 rounded-full shrink-0 ${
        isChecking ? 'bg-yellow-400/60 animate-pulse' : isOk ? 'bg-green-400' : 'bg-red-400'
      }`}
    />
  );
}

function SettingsSection({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-muted">
        {icon}
        <h3 className="text-xs font-semibold uppercase tracking-wider">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0 gap-3">
      <span className="text-muted">{label}</span>
      <span className="font-medium text-secondary text-right break-all">{value}</span>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="text-xs text-muted mb-1.5 block">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-elevated border border-border rounded-xl px-3 py-2 text-sm text-primary focus:border-accent/50 focus:outline-none transition-colors"
        placeholder={placeholder}
      />
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
}) {
  return (
    <div>
      <label className="text-xs text-muted mb-1.5 block">{label}</label>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full bg-elevated border border-border rounded-xl px-3 py-2 text-sm text-primary focus:border-accent/50 focus:outline-none transition-colors"
      />
    </div>
  );
}

function RangeField({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <label className="text-xs text-muted mb-1.5 block">{label}</label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full accent-accent"
      />
      <div className="flex justify-between text-xs text-muted mt-1">
        <span>{min}</span>
        <span className="font-mono text-accent font-medium">{value.toFixed(2)}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

function StatusBadge({ status, label }: { status: 'ok' | 'error' | 'checking'; label: string }) {
  return (
    <span
      className={`text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0 mt-0.5 ${
        status === 'ok'
          ? 'bg-green-500/15 text-green-400'
          : status === 'error'
            ? 'bg-red-500/15 text-red-400'
            : 'bg-yellow-500/15 text-yellow-400'
      }`}
    >
      {label}
    </span>
  );
}

function DeviceStatusCard({ status }: { status: VoiceDeviceStatus | null }) {
  if (!status) {
    return (
      <div className="rounded-xl border border-border bg-elevated/40 px-3 py-3 text-sm text-secondary">
        Nessun dato dal dispositivo. Verifica il bridge, il firmware e l'heartbeat del box.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-elevated/30 p-4 space-y-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-primary font-medium">{status.device_name}</p>
          <p className="text-xs text-muted">ID {status.device_id}</p>
        </div>
        <StatusBadge
          status={status.status === 'online' ? 'ok' : status.status === 'offline' ? 'error' : 'checking'}
          label={status.status}
        />
      </div>
      <InfoRow label="IP" value={status.remote_ip || 'n/d'} />
      <InfoRow label="Firmware" value={status.firmware_mode || 'n/d'} />
      <InfoRow label="Wake word" value={status.wake_word_label || 'n/d'} />
      <InfoRow label="Modello wake" value={status.wake_word_model || 'n/d'} />
      <InfoRow label="Ultimo heartbeat" value={status.last_seen_iso || 'n/d'} />
      <InfoRow label="Sessione voce" value={status.voice_session_status || 'idle'} />
      {status.last_transcript && (
        <div className="rounded-xl border border-border/70 bg-surface px-3 py-2">
          <p className="text-xs text-muted mb-1">Ultima trascrizione</p>
          <p className="text-xs text-secondary whitespace-pre-wrap">{status.last_transcript}</p>
        </div>
      )}
      {status.last_response_text && (
        <div className="rounded-xl border border-border/70 bg-surface px-3 py-2">
          <p className="text-xs text-muted mb-1">Ultima risposta vocale</p>
          <p className="text-xs text-secondary whitespace-pre-wrap">{status.last_response_text}</p>
        </div>
      )}
      {status.error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">
          {status.error}
        </div>
      )}
    </div>
  );
}

function DeviceFleetCard({
  devices,
  selectedDeviceId,
  onSelect,
}: {
  devices: VoiceDeviceStatus[];
  selectedDeviceId: string;
  onSelect: (deviceId: string) => void;
}) {
  if (devices.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-elevated/40 px-3 py-3 text-sm text-secondary">
        Nessun dispositivo registrato sul bridge in questo momento.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {devices.map(device => {
        const selected = device.device_id === selectedDeviceId;
        return (
          <button
            key={device.device_id}
            onClick={() => onSelect(device.device_id)}
            className={`w-full text-left rounded-2xl border p-3 transition-colors ${
              selected
                ? 'border-accent/60 bg-accent/10'
                : 'border-border bg-elevated/30 hover:bg-elevated/50'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-primary">{device.device_name}</p>
                <p className="text-xs text-muted">{device.device_id} · {device.remote_ip || 'n/d'}</p>
              </div>
              <StatusBadge
                status={device.status === 'online' ? 'ok' : device.status === 'offline' ? 'error' : 'checking'}
                label={device.status}
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-secondary">
              <span className="rounded-full border border-border px-2 py-1">{device.firmware_mode || 'ptt'}</span>
              <span className="rounded-full border border-border px-2 py-1">wake: {device.wake_word_label || 'n/d'}</span>
              <span className="rounded-full border border-border px-2 py-1">sessione: {device.voice_session_status || 'idle'}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function BridgeHealthCard({ snapshot }: { snapshot: BridgeHealthSnapshot | null }) {
  if (!snapshot) {
    return (
      <div className="rounded-xl border border-border bg-elevated/40 px-3 py-3 text-sm text-secondary">
        Nessun dato health disponibile dal bridge.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-border bg-elevated/30 p-4 space-y-3 text-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-primary font-medium">Snapshot bridge</p>
            <p className="text-xs text-muted">Host pubblico {snapshot.public_host}</p>
          </div>
          <StatusBadge status="ok" label={snapshot.status} />
        </div>
        <InfoRow label="Dispositivi noti" value={String(snapshot.device_count)} />
        <InfoRow label="Sessioni attive" value={String(snapshot.active_sessions)} />
        <InfoRow label="Sessioni in errore" value={String(snapshot.error_sessions)} />
        <InfoRow label="Ultimo heartbeat" value={snapshot.latest_seen_iso || 'n/d'} />
        <InfoRow label="File config" value={snapshot.bridge_settings_file} />
        <InfoRow label="Porta HTTP" value={String(snapshot.ports.http)} />
        <InfoRow label="Porta Wyoming" value={String(snapshot.ports.wyoming)} />
        <InfoRow label="UDP audio" value={String(snapshot.ports.udp_audio)} />
        <InfoRow label="UDP control" value={String(snapshot.ports.udp_control)} />
        {snapshot.latest_audio_url && (
          <div className="rounded-xl border border-border/70 bg-surface px-3 py-2 space-y-2">
            <div>
              <p className="text-xs text-muted mb-1">Ultimo audio generato</p>
              <p className="text-xs text-secondary break-all">{snapshot.latest_audio_url}</p>
            </div>
            <audio controls src={snapshot.latest_audio_url} className="w-full" />
          </div>
        )}
        {snapshot.latest_transcript && (
          <div className="rounded-xl border border-border/70 bg-surface px-3 py-2">
            <p className="text-xs text-muted mb-1">Ultima trascrizione globale</p>
            <p className="text-xs text-secondary whitespace-pre-wrap">{snapshot.latest_transcript}</p>
          </div>
        )}
        {snapshot.latest_response_text && (
          <div className="rounded-xl border border-border/70 bg-surface px-3 py-2">
            <p className="text-xs text-muted mb-1">Ultima risposta globale</p>
            <p className="text-xs text-secondary whitespace-pre-wrap">{snapshot.latest_response_text}</p>
          </div>
        )}
        {snapshot.latest_error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400 whitespace-pre-wrap">
            {snapshot.latest_error}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-elevated/30 p-4 space-y-3 text-sm">
        <div>
          <p className="text-primary font-medium">Log recenti</p>
          <p className="text-xs text-muted">Coda locale del processo bridge</p>
        </div>
        <div className="rounded-xl border border-border/70 bg-surface p-2 max-h-64 overflow-auto">
          {snapshot.recent_logs.length === 0 ? (
            <p className="px-2 py-2 text-xs text-muted">Nessun log disponibile.</p>
          ) : (
            <div className="space-y-1">
              {snapshot.recent_logs.slice().reverse().map((entry, index) => (
                <div key={`${entry.timestamp}-${index}`} className="rounded-lg px-2 py-1.5 text-xs border border-border/50 bg-elevated/40">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted">{entry.timestamp}</span>
                    <span className={`font-medium ${entry.level === 'ERROR' ? 'text-red-400' : entry.level === 'WARNING' ? 'text-amber-300' : 'text-secondary'}`}>
                      {entry.level}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-secondary">{entry.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GemcodeLogo({ size = 28 }: { size?: number }) {
  return (
    <div
      style={{ width: size, height: size }}
      className="rounded-xl bg-gradient-to-br from-accent via-blue-500 to-accent-hover flex items-center justify-center shrink-0 shadow-sm"
    >
      <Sparkles style={{ width: size * 0.5, height: size * 0.5 }} className="text-white" />
    </div>
  );
}

const PERMISSION_DESCRIPTORS: PermissionDescriptor[] = [
  { key: 'fileRead', label: 'Lettura file', description: 'Leggere file e cartelle dal disco locale', icon: <FolderOpen className="w-4 h-4" />, risk: 'low' },
  { key: 'fileWrite', label: 'Scrittura file', description: 'Creare e modificare file sul disco locale', icon: <Save className="w-4 h-4" />, risk: 'medium' },
  { key: 'fileDelete', label: 'Eliminazione file', description: 'Eliminare file e cartelle dal disco', icon: <Trash2 className="w-4 h-4" />, risk: 'high' },
  { key: 'shellExec', label: 'Esecuzione comandi', description: 'Eseguire comandi nel terminale del sistema', icon: <Terminal className="w-4 h-4" />, risk: 'high' },
  { key: 'codeExecute', label: 'Esecuzione codice', description: 'Eseguire codice generato (Python, JS, ecc.)', icon: <Zap className="w-4 h-4" />, risk: 'high' },
  { key: 'webSearch', label: 'Ricerca web', description: 'Cercare informazioni su internet', icon: <Globe className="w-4 h-4" />, risk: 'low' },
  { key: 'memoryRead', label: 'Lettura memoria', description: 'Consultare i file di memoria e conoscenza', icon: <Brain className="w-4 h-4" />, risk: 'low' },
  { key: 'memoryWrite', label: 'Scrittura memoria', description: 'Scrivere nuovi ricordi e conoscenze', icon: <Brain className="w-4 h-4" />, risk: 'low' },
  { key: 'skillRead', label: 'Lettura skills', description: 'Leggere e usare skills esistenti', icon: <Sparkles className="w-4 h-4" />, risk: 'low' },
  { key: 'skillWrite', label: 'Scrittura skills', description: 'Creare e modificare skills riutilizzabili', icon: <Sparkles className="w-4 h-4" />, risk: 'medium' },
  { key: 'mcpConnect', label: 'Connessione MCP', description: 'Connettersi a server MCP esterni e plugin', icon: <Plug className="w-4 h-4" />, risk: 'medium' },
  { key: 'ttsSpeak', label: 'Sintesi vocale', description: 'Generare audio parlato dalle risposte', icon: <Volume2 className="w-4 h-4" />, risk: 'low' },
  { key: 'imageGenerate', label: 'Generazione immagini', description: 'Creare immagini tramite modelli generativi', icon: <Image className="w-4 h-4" />, risk: 'low' },
  { key: 'videoAudioProcess', label: 'Elaborazione media', description: 'Processare video e audio (conversione, analisi)', icon: <Video className="w-4 h-4" />, risk: 'medium' },
  { key: 'peripheralAccess', label: 'Accesso periferiche', description: 'Interagire con periferiche hardware (webcam, microfono, stampante)', icon: <Mic className="w-4 h-4" />, risk: 'high' },
];

function PermissionRow({
  descriptor,
  value,
  onChange,
}: {
  descriptor: PermissionDescriptor;
  value: PermissionPolicy;
  onChange: (value: PermissionPolicy) => void;
}) {
  const riskColor = descriptor.risk === 'high'
    ? 'text-red-400'
    : descriptor.risk === 'medium'
      ? 'text-amber-400'
      : 'text-green-400';

  const riskLabel = descriptor.risk === 'high'
    ? 'ALTO'
    : descriptor.risk === 'medium'
      ? 'MEDIO'
      : 'BASSO';

  return (
    <div className="rounded-xl border border-border bg-elevated/30 px-3 py-2.5 space-y-2">
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 ${riskColor}`}>{descriptor.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-primary">{descriptor.label}</p>
            <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${
              descriptor.risk === 'high'
                ? 'border-red-500/30 bg-red-500/10 text-red-400'
                : descriptor.risk === 'medium'
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                  : 'border-green-500/30 bg-green-500/10 text-green-400'
            }`}>{riskLabel}</span>
          </div>
          <p className="text-[11px] text-muted leading-snug mt-0.5">{descriptor.description}</p>
        </div>
      </div>
      <div className="flex gap-1.5">
        <button
          onClick={() => onChange('allow')}
          className={`flex-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
            value === 'allow'
              ? 'bg-green-500/20 border border-green-500/40 text-green-400 shadow-sm shadow-green-500/10'
              : 'border border-border text-muted hover:text-secondary hover:bg-elevated'
          }`}
        >
          Accetta
        </button>
        <button
          onClick={() => onChange('ask')}
          className={`flex-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
            value === 'ask'
              ? 'bg-amber-500/20 border border-amber-500/40 text-amber-400 shadow-sm shadow-amber-500/10'
              : 'border border-border text-muted hover:text-secondary hover:bg-elevated'
          }`}
        >
          Chiedi
        </button>
        <button
          onClick={() => onChange('deny')}
          className={`flex-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
            value === 'deny'
              ? 'bg-red-500/20 border border-red-500/40 text-red-400 shadow-sm shadow-red-500/10'
              : 'border border-border text-muted hover:text-secondary hover:bg-elevated'
          }`}
        >
          Nega
        </button>
      </div>
    </div>
  );
}
