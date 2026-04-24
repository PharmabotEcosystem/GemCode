import type React from 'react';

/* ── Chat ───────────────────────────────────────────────────── */

export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  isStreaming?: boolean;
  apiText?: string;
  attachments?: ChatAttachment[];
}

export interface Conversation {
  id: string;
  title: string;
  timestamp: Date;
}

/* ── Attachments ────────────────────────────────────────────── */

export type AttachmentKind = 'image' | 'pdf' | 'docx' | 'text' | 'binary';

export interface ChatAttachment {
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

/* ── Draft file creator ─────────────────────────────────────── */

export type DraftFormat = 'txt' | 'md' | 'json' | 'js' | 'ts' | 'py' | 'html' | 'docx' | 'pdf';

export interface DraftFileOption {
  value: DraftFormat;
  label: string;
  extension: string;
  mimeType: string;
  mode: 'text' | 'docx' | 'pdf';
}

export interface DraftFileState {
  fileName: string;
  format: DraftFormat;
  content: string;
}

/* ── Permissions ────────────────────────────────────────────── */

export type PermissionPolicy = 'allow' | 'deny' | 'ask';

export interface AgentPermissions {
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

export interface PermissionDescriptor {
  key: keyof AgentPermissions;
  label: string;
  description: string;
  icon: React.ReactNode;
  risk: 'low' | 'medium' | 'high';
}

/* ── Skills ─────────────────────────────────────────────────── */

export interface Skill {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  tools: string[];
  enabled: boolean;
  category: 'system' | 'custom' | 'import';
}

/* ── Settings ───────────────────────────────────────────────── */

export interface AppSettings {
  ollamaHost: string;
  ollamaModel: string;
  temperature: number;
  systemPrompt: string;
  bridgeUrl: string;
  voiceDeviceId: string;
  agentPermissions: AgentPermissions;
  skills: Skill[];
  autoSpeak: boolean;
  ttsMode: 'browser' | 'bridge';
}

/* ── Voice bridge ───────────────────────────────────────────── */

export type Reachability = 'online' | 'offline' | 'checking';

export interface VoiceBridgeSettings {
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
  led_idle_color: number[];
  led_idle_brightness: number;
  led_listening_color: number[];
  led_thinking_color: number[];
  led_speaking_color: number[];
  led_error_color: number[];
}

export interface VoiceDeviceStatus {
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

export interface BridgeLogEntry {
  timestamp: string;
  level: string;
  message: string;
}

export interface BridgeHealthSnapshot {
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

/* ── Model selector ─────────────────────────────────────────── */

export interface ModelOption {
  name: string;
  family?: string;
  parameterSize?: string;
  quantization?: string;
}

export interface VoiceOption {
  value: string;
  label: string;
  provider: string;
}

/* ── Settings tabs ──────────────────────────────────────────── */

export type SettingsTab = 'ai' | 'skills' | 'voice' | 'security' | 'workspace' | 'info';
