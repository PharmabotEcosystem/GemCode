import type { BridgeHealthSnapshot, ModelOption, VoiceBridgeSettings, VoiceDeviceStatus } from './types';
import { DEFAULT_VOICE_BRIDGE_SETTINGS } from './constants';

/* ── Ollama ──────────────────────────────────────────────────── */

export async function* ollamaStream(
  host: string, model: string,
  messages: { role: string; content: string; images?: string[] }[],
  options: { temperature: number; topK: number; topP: number; repeatPenalty: number; numPredict: number; numCtx: number },
  signal: AbortSignal,
): AsyncGenerator<string> {
  const url = `${host.replace(/\/$/, '')}/api/chat`;
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, messages, stream: true, keep_alive: '24h',
        options: {
          temperature: options.temperature,
          top_k: options.topK,
          top_p: options.topP,
          repeat_penalty: options.repeatPenalty,
          num_predict: options.numPredict,
          num_ctx: options.numCtx
        }
      }),
      signal,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Impossibile raggiungere Ollama su ${host}. Assicurati che sia in esecuzione e che il modello "${model}" sia scaricato. Dettaglio: ${msg}`);
  }
  if (!resp.ok) { const body = await resp.text().catch(() => ''); throw new Error(`Ollama HTTP ${resp.status}: ${body}`); }
  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      if (buffer.trim()) {
        try { const j = JSON.parse(buffer); const t: string = j?.message?.content ?? ''; if (t) yield t; } catch { /* skip */ }
      }
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n'); buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try { const j = JSON.parse(line); const t: string = j?.message?.content ?? ''; if (t) yield t; if (j.done) return; } catch { /* skip */ }
    }
  }
}

export async function checkOllamaStatus(host: string): Promise<'online' | 'offline'> {
  try { const r = await fetch(`${host.replace(/\/$/, '')}/api/tags`, { signal: AbortSignal.timeout(2000) }); return r.ok ? 'online' : 'offline'; } catch { return 'offline'; }
}

export async function fetchModelOptions(baseUrl: string): Promise<ModelOption[]> {
  const r = await fetch(`${baseUrl.replace(/\/$/, '')}/api/tags`, { signal: AbortSignal.timeout(4000) });
  if (!r.ok) throw new Error(`Model tags HTTP ${r.status}`);
  const data = await r.json();
  return (Array.isArray(data?.models) ? data.models : [])
    .map((m: any) => ({ name: String(m?.name ?? m?.model ?? ''), family: m?.details?.family ? String(m.details.family) : undefined, parameterSize: m?.details?.parameter_size ? String(m.details.parameter_size) : undefined, quantization: m?.details?.quantization_level ? String(m.details.quantization_level) : undefined }))
    .filter((m: ModelOption) => m.name);
}

/* ── Bridge ──────────────────────────────────────────────────── */

export async function checkBridgeStatus(bridgeUrl: string): Promise<'online' | 'offline'> {
  try { const r = await fetch(`${bridgeUrl.replace(/\/$/, '')}/health`, { signal: AbortSignal.timeout(2000) }); return r.ok ? 'online' : 'offline'; } catch { return 'offline'; }
}

export async function fetchBridgeSettings(bridgeUrl: string): Promise<VoiceBridgeSettings> {
  const r = await fetch(`${bridgeUrl.replace(/\/$/, '')}/api/settings`, { signal: AbortSignal.timeout(4000) });
  if (!r.ok) throw new Error(`Bridge HTTP ${r.status}`);
  return { ...DEFAULT_VOICE_BRIDGE_SETTINGS, ...(await r.json()) };
}

export async function saveBridgeSettings(bridgeUrl: string, config: VoiceBridgeSettings): Promise<VoiceBridgeSettings> {
  const r = await fetch(`${bridgeUrl.replace(/\/$/, '')}/api/settings`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config), signal: AbortSignal.timeout(5000),
  });
  if (!r.ok) { const b = await r.text().catch(() => ''); throw new Error(`Salvataggio bridge fallito (${r.status}): ${b}`); }
  return { ...DEFAULT_VOICE_BRIDGE_SETTINGS, ...(await r.json()) };
}

export async function fetchVoiceDeviceStatus(bridgeUrl: string, deviceId: string): Promise<VoiceDeviceStatus | null> {
  const r = await fetch(`${bridgeUrl.replace(/\/$/, '')}/api/device/status?device_id=${encodeURIComponent(deviceId)}`, { signal: AbortSignal.timeout(4000) });
  if (!r.ok) return null;
  return await r.json();
}

export async function fetchBridgeHealth(bridgeUrl: string): Promise<BridgeHealthSnapshot> {
  const r = await fetch(`${bridgeUrl.replace(/\/$/, '')}/api/bridge/health`, { signal: AbortSignal.timeout(4000) });
  if (!r.ok) throw new Error(`Bridge health HTTP ${r.status}`);
  return await r.json();
}

export function toChatEndpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}/api/chat`;
}
