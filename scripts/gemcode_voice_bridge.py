import asyncio
import base64
from collections import deque
import io
import json
import logging
import os
import re
import socket
import tempfile
import time
import uuid
import wave
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import aiohttp
from aiohttp import web
try:
    import edge_tts
except ImportError:
    edge_tts = None
from faster_whisper import WhisperModel

from wyoming.asr import Transcribe, Transcript
from wyoming.audio import AudioChunk, AudioStart, AudioStop
from wyoming.event import Event
from wyoming.info import AsrModel, AsrProgram, Attribution, Describe, Info, TtsProgram, TtsVoice
from wyoming.server import AsyncEventHandler, AsyncTcpServer
from wyoming.tts import Synthesize

DEFAULT_GEMCODE_AGENT_URL = "http://localhost:11434/api/chat"
DEFAULT_GEMCODE_MODEL = "gemma4"
DEFAULT_TTS_PROVIDER = "edge-tts"
DEFAULT_WINDOWS_TTS_VOICE = "Microsoft Elsa Desktop"
DEFAULT_EDGE_TTS_VOICE = "it-IT-ElsaNeural"
ALLOWED_EDGE_TTS_VOICES = {
    "it-IT-ElsaNeural",
    "it-IT-IsabellaNeural",
}
ALLOWED_WINDOWS_TTS_VOICES = {
    "Microsoft Elsa Desktop",
    "Microsoft Elsa",
}
DEFAULT_GEMCODE_SYSTEM_PROMPT = (
    "Rispondi sempre in italiano colloquiale come assistente vocale locale di GemCode. "
    "Mantieni la risposta molto breve: massimo due frasi corte. "
    "Non usare markdown, elenchi, titoli, citazioni o spiegazioni metalinguistiche. "
    "Se l'input e' confuso, offensivo o sembra rumore, chiedi semplicemente di ripetere."
)
WHISPER_MODEL = "tiny"
WHISPER_LANGUAGE = "it"
WYOMING_PORT = 10300
HTTP_PORT = 10301
UDP_AUDIO_PORT = 10310
UDP_CONTROL_PORT = 10311
HOST = "0.0.0.0"
AUDIO_RATE = 16000
AUDIO_WIDTH = 2   # 16-bit PCM
AUDIO_CHANNELS = 1
SESSION_TTL_SECONDS = 300
BRIDGE_PUBLIC_HOST = os.getenv("GEMCODE_BRIDGE_HOST", "192.168.1.76")
DEVICE_ACTIVE_TIMEOUT_SECONDS = 30
BRIDGE_SETTINGS_FILE = Path(__file__).with_name("gemcode_voice_bridge_settings.json")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("gemcode_bridge")


class InMemoryLogHandler(logging.Handler):
    def __init__(self, max_entries: int = 120) -> None:
        super().__init__()
        self.entries: deque[dict[str, str]] = deque(maxlen=max_entries)

    def emit(self, record: logging.LogRecord) -> None:
        try:
            message = self.format(record)
        except Exception:
            message = record.getMessage()

        self.entries.append(
            {
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(record.created)),
                "level": record.levelname,
                "message": message,
            }
        )

    def snapshot(self) -> list[dict[str, str]]:
        return list(self.entries)


log_buffer_handler = InMemoryLogHandler()
log_buffer_handler.setLevel(logging.INFO)
log_buffer_handler.setFormatter(logging.Formatter("%(levelname)s: %(message)s"))
logger.addHandler(log_buffer_handler)

logger.info(f"Caricamento modello Whisper '{WHISPER_MODEL}'...")
stt_model = WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8")

_WYOMING_INFO = Info(
    asr=[AsrProgram(
        name="gemcode-whisper",
        description="faster-whisper STT per GemCode",
        version="1.0",
        attribution=Attribution(name="GemCode", url=""),
        installed=True,
        models=[AsrModel(
            name=WHISPER_MODEL,
            description=f"Whisper {WHISPER_MODEL}",
            version="1.0",
            attribution=Attribution(name="OpenAI", url="https://github.com/openai/whisper"),
            installed=True,
            languages=[WHISPER_LANGUAGE],
        )],
    )],
    tts=[TtsProgram(
        name="edge-tts",
        description="Microsoft Edge TTS",
        version="1.0",
        attribution=Attribution(name="Microsoft", url=""),
        installed=True,
        voices=[TtsVoice(
            name="it-IT-ElsaNeural",
            description="Elsa (Italiano)",
            version="1.0",
            attribution=Attribution(name="Microsoft", url=""),
            installed=True,
            languages=[WHISPER_LANGUAGE],
        )],
    )],
)

VOICE_AUDIO_DIR = Path(tempfile.gettempdir()) / "gemcode_voice_bridge"
VOICE_AUDIO_DIR.mkdir(parents=True, exist_ok=True)


def detect_public_host() -> str:
    env_host = os.getenv("GEMCODE_BRIDGE_HOST")
    if env_host:
        return env_host

    return BRIDGE_PUBLIC_HOST


@dataclass
class VoiceSession:
    device_id: str
    remote_ip: str
    sample_rate: int = AUDIO_RATE
    sample_width: int = AUDIO_WIDTH
    channels: int = AUDIO_CHANNELS
    status: str = "idle"
    transcript: str = ""
    response_text: str = ""
    audio_url: str = ""
    audio_path: str = ""
    error: str = ""
    last_update: float = field(default_factory=time.monotonic)
    audio_buffer: bytearray = field(default_factory=bytearray)


@dataclass
class DeviceState:
    device_id: str
    remote_ip: str = ""
    firmware_mode: str = "ptt"
    wake_word_label: str = "OK GEMMA"
    wake_word_model: str = "placeholder - serve un modello OK GEMMA dedicato"
    device_name: str = "Home Assistant Voice PE"
    last_seen: float = field(default_factory=time.time)


@dataclass
class BridgeConfig:
    agent_url: str = DEFAULT_GEMCODE_AGENT_URL
    model: str = DEFAULT_GEMCODE_MODEL
    system_prompt: str = DEFAULT_GEMCODE_SYSTEM_PROMPT
    temperature: float = 0.2
    max_response_sentences: int = 2
    max_response_chars: int = 220
    tts_provider: str = DEFAULT_TTS_PROVIDER
    tts_voice: str = DEFAULT_WINDOWS_TTS_VOICE if DEFAULT_TTS_PROVIDER == "windows-sapi" else DEFAULT_EDGE_TTS_VOICE
    device_id: str = "box3"
    device_name: str = "Home Assistant Voice PE"
    device_mode: str = "ptt"
    wake_word_label: str = "OK GEMMA"
    wake_word_model: str = "placeholder - serve un modello OK GEMMA dedicato"
    wake_word_notes: str = "Per una vera wake word OK GEMMA serve un modello micro_wake_word dedicato."
    led_idle_color: list[int] = field(default_factory=lambda: [0, 0, 255])
    led_idle_brightness: int = 45
    led_listening_color: list[int] = field(default_factory=lambda: [0, 255, 25])
    led_thinking_color: list[int] = field(default_factory=lambda: [255, 89, 0])
    led_speaking_color: list[int] = field(default_factory=lambda: [0, 191, 255])
    led_error_color: list[int] = field(default_factory=lambda: [255, 0, 0])
    @classmethod
    def from_dict(cls, data: dict[str, object]) -> "BridgeConfig":
        tts_provider = str(data.get("tts_provider", DEFAULT_TTS_PROVIDER)).strip().lower()
        tts_voice = str(
            data.get(
                "tts_voice",
                DEFAULT_WINDOWS_TTS_VOICE if tts_provider == "windows-sapi" else DEFAULT_EDGE_TTS_VOICE,
            )
        )

        if tts_provider == "windows-sapi" and tts_voice not in ALLOWED_WINDOWS_TTS_VOICES:
            tts_voice = DEFAULT_WINDOWS_TTS_VOICE
        elif tts_provider == "edge-tts" and tts_voice not in ALLOWED_EDGE_TTS_VOICES:
            tts_voice = DEFAULT_EDGE_TTS_VOICE

        return cls(
            agent_url=str(data.get("agent_url", DEFAULT_GEMCODE_AGENT_URL)),
            model=str(data.get("model", DEFAULT_GEMCODE_MODEL)),
            system_prompt=str(data.get("system_prompt", DEFAULT_GEMCODE_SYSTEM_PROMPT)),
            temperature=float(data.get("temperature", 0.2)),
            max_response_sentences=max(1, int(data.get("max_response_sentences", 2))),
            max_response_chars=max(80, int(data.get("max_response_chars", 220))),
            tts_provider=tts_provider,
            tts_voice=tts_voice,
            device_id=str(data.get("device_id", "box3")),
            device_name=str(data.get("device_name", "Home Assistant Voice PE")),
            device_mode=str(data.get("device_mode", "ptt")),
            wake_word_label=str(data.get("wake_word_label", "OK GEMMA")),
            wake_word_model=str(data.get("wake_word_model", "placeholder - serve un modello OK GEMMA dedicato")),
            wake_word_notes=str(data.get("wake_word_notes", "Per una vera wake word OK GEMMA serve un modello micro_wake_word dedicato.")),
            led_idle_color=list(data.get("led_idle_color", [0, 0, 255])),
            led_idle_brightness=int(data.get("led_idle_brightness", 45)),
            led_listening_color=list(data.get("led_listening_color", [0, 255, 25])),
            led_thinking_color=list(data.get("led_thinking_color", [255, 89, 0])),
            led_speaking_color=list(data.get("led_speaking_color", [0, 191, 255])),
            led_error_color=list(data.get("led_error_color", [255, 0, 0])),
        )

    def to_dict(self) -> dict[str, object]:
        return {
            "agent_url": self.agent_url,
            "model": self.model,
            "system_prompt": self.system_prompt,
            "temperature": self.temperature,
            "max_response_sentences": self.max_response_sentences,
            "max_response_chars": self.max_response_chars,
            "tts_provider": self.tts_provider,
            "tts_voice": self.tts_voice,
            "device_id": self.device_id,
            "device_name": self.device_name,
            "device_mode": self.device_mode,
            "wake_word_label": self.wake_word_label,
            "wake_word_model": self.wake_word_model,
            "wake_word_notes": self.wake_word_notes,
            "led_idle_color": self.led_idle_color,
            "led_idle_brightness": self.led_idle_brightness,
            "led_listening_color": self.led_listening_color,
            "led_thinking_color": self.led_thinking_color,
            "led_speaking_color": self.led_speaking_color,
            "led_error_color": self.led_error_color,
        }


class BridgeConfigStore:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.config = self._load()

    def _load(self) -> BridgeConfig:
        if not self.path.exists():
            config = BridgeConfig()
            self.save(config)
            return config

        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            config = BridgeConfig()
            self.save(config)
            return config

        return BridgeConfig.from_dict(data)

    def save(self, config: BridgeConfig) -> None:
        self.path.write_text(json.dumps(config.to_dict(), indent=2, ensure_ascii=True), encoding="utf-8")
        self.config = config

    def update(self, data: dict[str, object]) -> BridgeConfig:
        merged = self.config.to_dict()
        merged.update(data)
        config = BridgeConfig.from_dict(merged)
        self.save(config)
        return config


bridge_config_store = BridgeConfigStore(BRIDGE_SETTINGS_FILE)


class BridgeState:
    def __init__(self) -> None:
        self.sessions: dict[str, VoiceSession] = {}
        self.devices: dict[str, DeviceState] = {}
        self.active_remote_sessions: dict[str, str] = {}
        self.lock = asyncio.Lock()
        self.public_host = detect_public_host()

    async def start_session(
        self,
        device_id: str,
        remote_ip: str,
        sample_rate: int,
        sample_width: int,
        channels: int,
    ) -> None:
        async with self.lock:
            device = self.devices.get(device_id) or DeviceState(device_id=device_id)
            device.remote_ip = remote_ip
            device.last_seen = time.time()
            device.device_name = bridge_config_store.config.device_name if device_id == bridge_config_store.config.device_id else device.device_name
            self.devices[device_id] = device
            self.sessions[device_id] = VoiceSession(
                device_id=device_id,
                remote_ip=remote_ip,
                sample_rate=sample_rate,
                sample_width=sample_width,
                channels=channels,
                status="recording",
            )
            self.active_remote_sessions[remote_ip] = device_id
            logger.info(
                "Sessione PTT avviata per %s da %s (%s Hz, %s bytes, %s canali)",
                device_id,
                remote_ip,
                sample_rate,
                sample_width,
                channels,
            )

    async def append_audio(self, remote_ip: str, packet: bytes) -> None:
        async with self.lock:
            device_id = self.active_remote_sessions.get(remote_ip)
            if not device_id:
                return

            session = self.sessions.get(device_id)
            if not session or session.status != "recording":
                return

            session.audio_buffer.extend(packet)
            session.last_update = time.monotonic()

    async def mark_device_seen(
        self,
        device_id: str,
        remote_ip: str,
        firmware_mode: str | None = None,
        wake_word_label: str | None = None,
        wake_word_model: str | None = None,
        device_name: str | None = None,
    ) -> DeviceState:
        async with self.lock:
            device = self.devices.get(device_id) or DeviceState(device_id=device_id)
            device.remote_ip = remote_ip
            device.last_seen = time.time()
            if firmware_mode:
                device.firmware_mode = firmware_mode
            if wake_word_label:
                device.wake_word_label = wake_word_label
            if wake_word_model:
                device.wake_word_model = wake_word_model
            if device_name:
                device.device_name = device_name
            self.devices[device_id] = device
            return device

    async def stop_session(self, device_id: str) -> VoiceSession | None:
        async with self.lock:
            session = self.sessions.get(device_id)
            if not session:
                return None

            session.status = "processing"
            session.last_update = time.monotonic()
            self.active_remote_sessions.pop(session.remote_ip, None)
            return session

    async def get_session(self, device_id: str) -> VoiceSession | None:
        async with self.lock:
            return self.sessions.get(device_id)

    async def get_device_snapshot(self, device_id: str) -> dict[str, object] | None:
        async with self.lock:
            device = self.devices.get(device_id)
            if not device:
                return None

            session = self.sessions.get(device_id)
            is_online = (time.time() - device.last_seen) <= DEVICE_ACTIVE_TIMEOUT_SECONDS
            return {
                "device_id": device.device_id,
                "device_name": device.device_name,
                "remote_ip": device.remote_ip,
                "firmware_mode": device.firmware_mode,
                "wake_word_label": device.wake_word_label,
                "wake_word_model": device.wake_word_model,
                "status": "online" if is_online else "offline",
                "last_seen_epoch": device.last_seen,
                "last_seen_iso": time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(device.last_seen)),
                "voice_session_status": session.status if session else "idle",
                "last_transcript": session.transcript if session else "",
                "last_response_text": session.response_text if session else "",
                "audio_url": session.audio_url if session else "",
                "error": session.error if session else "",
            }

    async def list_devices_snapshot(self) -> list[dict[str, object]]:
        async with self.lock:
            device_ids = list(self.devices.keys())

        snapshots: list[dict[str, object]] = []
        for device_id in device_ids:
            snapshot = await self.get_device_snapshot(device_id)
            if snapshot:
                snapshots.append(snapshot)
        return snapshots

    async def health_snapshot(self) -> dict[str, object]:
        devices = await self.list_devices_snapshot()
        active_sessions = 0
        error_sessions = 0

        async with self.lock:
            for session in self.sessions.values():
                if session.status not in {"idle", "done"}:
                    active_sessions += 1
                if session.error:
                    error_sessions += 1

        latest_audio_url = ""
        latest_audio_device_id = ""
        latest_error = ""
        latest_transcript = ""
        latest_response_text = ""
        latest_seen_epoch = 0.0
        latest_seen_iso = ""

        for device in devices:
            last_seen_epoch = float(device.get("last_seen_epoch", 0) or 0)
            if last_seen_epoch >= latest_seen_epoch:
                latest_seen_epoch = last_seen_epoch
                latest_seen_iso = str(device.get("last_seen_iso", ""))
                latest_audio_url = str(device.get("audio_url", ""))
                latest_audio_device_id = str(device.get("device_id", ""))
                latest_error = str(device.get("error", ""))
                latest_transcript = str(device.get("last_transcript", ""))
                latest_response_text = str(device.get("last_response_text", ""))

        return {
            "status": "ok",
            "public_host": self.public_host,
            "bridge_settings_file": str(BRIDGE_SETTINGS_FILE),
            "ports": {
                "wyoming": WYOMING_PORT,
                "http": HTTP_PORT,
                "udp_audio": UDP_AUDIO_PORT,
                "udp_control": UDP_CONTROL_PORT,
            },
            "config": bridge_config_store.config.to_dict(),
            "devices": devices,
            "device_count": len(devices),
            "active_sessions": active_sessions,
            "error_sessions": error_sessions,
            "latest_audio_url": latest_audio_url,
            "latest_audio_device_id": latest_audio_device_id,
            "latest_error": latest_error,
            "latest_transcript": latest_transcript,
            "latest_response_text": latest_response_text,
            "latest_seen_iso": latest_seen_iso,
            "recent_logs": log_buffer_handler.snapshot(),
        }

    async def set_ready(self, device_id: str, transcript: str, response_text: str, audio_name: str) -> None:
        async with self.lock:
            session = self.sessions.get(device_id)
            if not session:
                return

            session.transcript = transcript
            session.response_text = response_text
            session.audio_path = str(VOICE_AUDIO_DIR / audio_name)
            session.audio_url = f"http://{self.public_host}:{HTTP_PORT}/audio/{audio_name}"
            session.status = "ready"
            session.error = ""
            session.last_update = time.monotonic()

    async def set_error(self, device_id: str, error_message: str) -> None:
        async with self.lock:
            session = self.sessions.get(device_id)
            if not session:
                return

            session.status = "error"
            session.error = error_message
            session.last_update = time.monotonic()

    async def cleanup_expired(self) -> None:
        while True:
            await asyncio.sleep(30)
            deadline = time.monotonic() - SESSION_TTL_SECONDS
            async with self.lock:
                expired = [
                    device_id
                    for device_id, session in self.sessions.items()
                    if session.last_update < deadline
                ]

                for device_id in expired:
                    session = self.sessions.pop(device_id)
                    self.active_remote_sessions.pop(session.remote_ip, None)
                    if session.audio_path:
                        try:
                            Path(session.audio_path).unlink(missing_ok=True)
                        except OSError:
                            logger.warning("Impossibile rimuovere %s", session.audio_path)


bridge_state = BridgeState()


def _write_wav_bytes(audio_frames: bytes, sample_rate: int, sample_width: int, channels: int) -> bytes:
    wav_io = io.BytesIO()
    with wave.open(wav_io, "wb") as wav_file:
        wav_file.setnchannels(channels)
        wav_file.setsampwidth(sample_width)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(audio_frames)
    return wav_io.getvalue()


def _convert_int32_channel_to_pcm16(
    audio_buffer: bytes,
    channels: int,
    channel_index: int,
    shift: int,
) -> tuple[bytes, int]:
    converted = bytearray()
    peak = 0
    frame_size = 4 * channels
    sample_offset = channel_index * 4
    for offset in range(0, len(audio_buffer) - frame_size + 1, frame_size):
        sample = int.from_bytes(
            audio_buffer[offset + sample_offset:offset + sample_offset + 4],
            byteorder="little",
            signed=True,
        )
        pcm16_sample = max(min(sample >> shift, 32767), -32768)
        peak = max(peak, abs(pcm16_sample))
        converted.extend(int(pcm16_sample).to_bytes(2, byteorder="little", signed=True))

    return bytes(converted), peak


def build_wav_candidates(audio_buffer: bytes, sample_rate: int, sample_width: int, channels: int) -> list[tuple[str, bytes, int]]:
    if sample_width not in (2, 4):
        raise ValueError(f"Sample width non supportata: {sample_width}")

    if sample_width == 4:
        candidates: list[tuple[str, bytes, int]] = []
        for channel_index in range(channels):
            for shift in (16, 12, 8):
                pcm16_frames, peak = _convert_int32_channel_to_pcm16(audio_buffer, channels, channel_index, shift)
                label = f"ch{channel_index}_shift{shift}"
                candidates.append((label, _write_wav_bytes(pcm16_frames, sample_rate, 2, 1), peak))
        return candidates

    wav_frames = audio_buffer
    peak = 0
    if channels > 1:
        converted = bytearray()
        frame_size = sample_width * channels
        for offset in range(0, len(audio_buffer) - frame_size + 1, frame_size):
            sample_bytes = audio_buffer[offset:offset + sample_width]
            sample = int.from_bytes(sample_bytes, byteorder="little", signed=True)
            peak = max(peak, abs(sample))
            converted.extend(sample_bytes)

        wav_frames = bytes(converted)
        channels = 1
    else:
        for offset in range(0, len(audio_buffer) - sample_width + 1, sample_width):
            sample = int.from_bytes(audio_buffer[offset:offset + sample_width], byteorder="little", signed=True)
            peak = max(peak, abs(sample))

    return [("default", _write_wav_bytes(wav_frames, sample_rate, sample_width, channels), peak)]


def build_wav_bytes(audio_buffer: bytes, sample_rate: int, sample_width: int, channels: int) -> bytes:
    return build_wav_candidates(audio_buffer, sample_rate, sample_width, channels)[0][1]


def normalize_voice_text(text: str, max_sentences: int, max_chars: int) -> str:
    cleaned_lines: list[str] = []
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line in {"***", "---"}:
            continue

        if line.startswith(">"):
            line = line.lstrip("> ").strip()

        bullet_match = re.match(r"^(?:[-*•]|\d+\.)\s+", line)
        if bullet_match:
            line = line[bullet_match.end():].strip()

        line = line.replace("**", "").replace("__", "").replace("`", "")
        cleaned_lines.append(line)

    cleaned = " ".join(cleaned_lines)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if not cleaned:
        return "Puoi ripetere, per favore?"

    sentences = [part.strip() for part in re.split(r"(?<=[.!?])\s+", cleaned) if part.strip()]
    if sentences:
        cleaned = " ".join(sentences[:max_sentences])

    if len(cleaned) > max_chars:
        cleaned = cleaned[:max_chars - 3].rstrip(" ,;:") + "..."

    return cleaned


async def query_gemcode_with_options(
    text: str,
    *,
    agent_url: str,
    model: str,
    system_prompt: str,
    temperature: float,
    max_sentences: int,
    max_chars: int,
) -> str:
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": text},
        ],
        "stream": False,
        "options": {"temperature": temperature},
    }

    async with aiohttp.ClientSession() as session:
        async with session.post(
            agent_url,
            json=payload,
            timeout=aiohttp.ClientTimeout(total=90, sock_connect=15, sock_read=90),
        ) as response:
            if response.status != 200:
                raise RuntimeError(f"Errore API GemCode: HTTP {response.status}")

            data = await response.json()
            return normalize_voice_text(
                data.get("message", {}).get("content", ""),
                max_sentences=max_sentences,
                max_chars=max_chars,
            )


async def query_gemcode(text: str) -> str:
    config = bridge_config_store.config
    return await query_gemcode_with_options(
        text,
        agent_url=config.agent_url,
        model=config.model,
        system_prompt=config.system_prompt,
        temperature=config.temperature,
        max_sentences=config.max_response_sentences,
        max_chars=config.max_response_chars,
    )


def transcribe_wav_bytes(wav_bytes: bytes, language: Optional[str] = None) -> str:
    wav_io = io.BytesIO(wav_bytes)
    whisper_language = (language or WHISPER_LANGUAGE or "").strip() or None
    segments, _ = stt_model.transcribe(wav_io, language=whisper_language)
    return " ".join(segment.text for segment in segments).strip()


WINDOWS_SAPI_SCRIPT = """
param(
    [string]$Text,
    [string]$Voice,
    [string]$OutputPath
)

Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer

if ($Voice) {
    try {
        $synth.SelectVoice($Voice)
    } catch {
        $italianVoice = $synth.GetInstalledVoices() |
            Where-Object { $_.VoiceInfo.Culture.Name -eq 'it-IT' } |
            Select-Object -First 1
        if ($italianVoice) {
            $synth.SelectVoice($italianVoice.VoiceInfo.Name)
        }
    }
}

$synth.SetOutputToWaveFile($OutputPath)
$synth.Speak($Text)
$synth.Dispose()
""".strip()


async def synthesize_with_windows_sapi(text: str, voice: str, output_path: Path) -> None:
    temp_script = VOICE_AUDIO_DIR / "windows_sapi_tts.ps1"
    temp_script.write_text(WINDOWS_SAPI_SCRIPT, encoding="utf-8")

    process = await asyncio.create_subprocess_exec(
        "powershell",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        str(temp_script),
        "-Text",
        text or "Non ho una risposta.",
        "-Voice",
        voice,
        "-OutputPath",
        str(output_path),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await process.communicate()
    if process.returncode != 0:
        raise RuntimeError(f"Windows SAPI TTS fallito: {stderr.decode('utf-8', errors='ignore').strip()}")


async def stream_wav_file(handler: AsyncEventHandler, audio_path: Path) -> None:
    with wave.open(str(audio_path), "rb") as wav_file:
        await handler.write_event(
            AudioStart(
                rate=wav_file.getframerate(),
                width=wav_file.getsampwidth(),
                channels=wav_file.getnchannels(),
            ).event()
        )

        while True:
            frames = wav_file.readframes(2048)
            if not frames:
                break
            await handler.write_event(AudioChunk(audio=frames).event())

    await handler.write_event(AudioStop().event())


async def synthesize_text_to_audio(text: str, device_id: str, provider: str, voice: str) -> str:
    provider = (provider or DEFAULT_TTS_PROVIDER).strip().lower()

    if provider == "windows-sapi":
        audio_name = f"{device_id}-{uuid.uuid4().hex}.wav"
        output_path = VOICE_AUDIO_DIR / audio_name
        await synthesize_with_windows_sapi(text, voice or DEFAULT_WINDOWS_TTS_VOICE, output_path)
        return audio_name

    if provider == "edge-tts":
        if edge_tts is None:
            raise RuntimeError("edge-tts non e installato e il provider TTS configurato non e disponibile")

        audio_name = f"{device_id}-{uuid.uuid4().hex}.mp3"
        output_path = VOICE_AUDIO_DIR / audio_name
        communicate = edge_tts.Communicate(text or "Non ho una risposta.", voice or DEFAULT_EDGE_TTS_VOICE)
        await communicate.save(str(output_path))
        return audio_name

    raise RuntimeError(f"Provider TTS non supportato: {provider}")


async def synthesize_to_mp3(text: str, device_id: str) -> str:
    config = bridge_config_store.config
    return await synthesize_text_to_audio(text, device_id, config.tts_provider, config.tts_voice)


async def process_voice_session(session: VoiceSession) -> None:
    try:
        if not session.audio_buffer:
            raise RuntimeError("Nessun audio ricevuto")

        wav_candidates = build_wav_candidates(
            bytes(session.audio_buffer),
            sample_rate=session.sample_rate,
            sample_width=session.sample_width,
            channels=session.channels,
        )

        transcript = ""
        selected_label = ""
        peak_summaries: list[str] = []
        for label, wav_bytes, peak in wav_candidates:
            peak_summaries.append(f"{label}={peak}")
            logger.info("PTT %s candidato audio %s peak=%s", session.device_id, label, peak)
            if peak < 64:
                continue

            wav_io = io.BytesIO(wav_bytes)
            segments, _ = stt_model.transcribe(wav_io, language=WHISPER_LANGUAGE)
            transcript = " ".join(segment.text for segment in segments).strip()
            if transcript:
                selected_label = label
                break

        if not transcript:
            raise RuntimeError(f"Trascrizione vuota ({', '.join(peak_summaries)})")

        logger.info("PTT %s ha detto (%s): '%s'", session.device_id, selected_label, transcript)
        try:
            response_text = await query_gemcode(transcript)
        except asyncio.TimeoutError:
            response_text = "GemCode non ha risposto in tempo. Riprova tra poco."
        except Exception as exc:
            logger.warning("Fallback risposta vocale per %s dopo errore GemCode: %s", session.device_id, exc)
            response_text = "Non sono riuscito a contattare GemCode in questo momento."
        logger.info("Risposta GemCode per %s: %s", session.device_id, response_text)
        audio_name = await synthesize_to_mp3(response_text, session.device_id)
        await bridge_state.set_ready(session.device_id, transcript, response_text, audio_name)
    except Exception as exc:
        logger.exception("Errore pipeline PTT per %s", session.device_id)
        await bridge_state.set_error(session.device_id, str(exc))


class ControlProtocol(asyncio.DatagramProtocol):
    def datagram_received(self, data: bytes, addr) -> None:
        remote_ip = addr[0]
        try:
            payload = data.decode("utf-8").strip()
            command, *parts = payload.split("|")
        except UnicodeDecodeError:
            logger.warning("Pacchetto di controllo non valido da %s", remote_ip)
            return

        if command == "START" and len(parts) >= 4:
            device_id = parts[0]
            sample_rate = int(parts[1])
            sample_width = int(parts[2])
            channels = int(parts[3])
            asyncio.create_task(
                bridge_state.start_session(device_id, remote_ip, sample_rate, sample_width, channels)
            )
            return

        if command == "STOP" and parts:
            device_id = parts[0]

            async def stop_and_process() -> None:
                session = await bridge_state.stop_session(device_id)
                if session:
                    await process_voice_session(session)

            asyncio.create_task(stop_and_process())
            return

        logger.warning("Comando controllo sconosciuto da %s: %s", remote_ip, payload)


class AudioProtocol(asyncio.DatagramProtocol):
    def datagram_received(self, data: bytes, addr) -> None:
        asyncio.create_task(bridge_state.append_audio(addr[0], data))


async def handle_health(_request: web.Request) -> web.Response:
    snapshot = await bridge_state.health_snapshot()
    snapshot.pop("recent_logs", None)
    snapshot.pop("devices", None)
    snapshot.pop("config", None)
    return web.json_response(snapshot)


async def handle_bridge_health(_request: web.Request) -> web.Response:
    return web.json_response(await bridge_state.health_snapshot())


async def handle_voice_session(request: web.Request) -> web.Response:
    device_id = request.query.get("device_id", "").strip()
    if not device_id:
        return web.json_response({"error": "device_id mancante"}, status=400)

    session = await bridge_state.get_session(device_id)
    if not session:
        return web.json_response({"status": "idle"})

    return web.json_response(
        {
            "status": session.status,
            "transcript": session.transcript,
            "response_text": session.response_text,
            "audio_url": session.audio_url,
            "error": session.error,
        }
    )


async def handle_device_ping(request: web.Request) -> web.Response:
    device_id = request.query.get("device_id", bridge_config_store.config.device_id).strip()
    firmware_mode = request.query.get("firmware_mode", "ptt").strip() or "ptt"
    wake_word_label = request.query.get("wake_word_label", bridge_config_store.config.wake_word_label).strip()
    wake_word_model = request.query.get("wake_word_model", bridge_config_store.config.wake_word_model).strip()
    device_name = request.query.get("device_name", bridge_config_store.config.device_name).strip()
    remote_ip = request.remote or ""

    await bridge_state.mark_device_seen(
        device_id=device_id,
        remote_ip=remote_ip,
        firmware_mode=firmware_mode,
        wake_word_label=wake_word_label,
        wake_word_model=wake_word_model,
        device_name=device_name,
    )
    snapshot = await bridge_state.get_device_snapshot(device_id)
    return web.json_response(snapshot or {"status": "unknown"})


async def handle_device_status(request: web.Request) -> web.Response:
    device_id = request.query.get("device_id", bridge_config_store.config.device_id).strip()
    snapshot = await bridge_state.get_device_snapshot(device_id)
    if not snapshot:
        return web.json_response({"status": "unknown", "device_id": device_id}, status=404)
    return web.json_response(snapshot)


async def handle_devices(_request: web.Request) -> web.Response:
    return web.json_response({"devices": await bridge_state.list_devices_snapshot()})


async def handle_settings(request: web.Request) -> web.Response:
    if request.method == "GET":
        return web.json_response(bridge_config_store.config.to_dict())

    try:
        data = await request.json()
    except json.JSONDecodeError:
        return web.json_response({"error": "JSON non valido"}, status=400)

    if not isinstance(data, dict):
        return web.json_response({"error": "Payload non valido"}, status=400)

    updated = bridge_config_store.update(data)
    await bridge_state.mark_device_seen(
        device_id=updated.device_id,
        remote_ip="",
        firmware_mode=updated.device_mode,
        wake_word_label=updated.wake_word_label,
        wake_word_model=updated.wake_word_model,
        device_name=updated.device_name,
    )
    return web.json_response(updated.to_dict())


async def handle_device_led(request: web.Request) -> web.Response:
    if request.method != "POST":
        return web.json_response({"error": "Method non consentito"}, status=405)
    
    try:
        data = await request.json()
    except json.JSONDecodeError:
        return web.json_response({"error": "JSON non valido"}, status=400)
    
    device_id = str(data.get("device_id", bridge_config_store.config.device_id)).strip()
    r = int(data.get("r", 0))
    g = int(data.get("g", 0))
    b = int(data.get("b", 255))
    brightness = int(data.get("brightness", 50))
    effect = str(data.get("effect", "solid"))
    
    snapshot = await bridge_state.get_device_snapshot(device_id)
    if not snapshot or not snapshot.get("remote_ip"):
        return web.json_response({"error": f"Dispositivo {device_id} offline o IP sconosciuto"}, status=404)
    
    remote_ip = snapshot["remote_ip"]
    import aiohttp
    
    url = f"http://{remote_ip}/light/led_ring/turn_on?r={r}&g={g}&b={b}&brightness={brightness}"
    if effect != "solid":
        url += f"&effect={effect}"
        
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, headers={"Content-Length": "0"}, timeout=3) as resp:
                if resp.status == 200:
                    return web.json_response({"status": "ok", "sent_to": remote_ip})
                else:
                    return web.json_response({"error": f"ESPHome ha risposto con {resp.status}"}, status=500)
    except Exception as exc:
        logger.exception("Errore REST API LED")
        return web.json_response({"error": f"REST fallito: {exc}"}, status=500)


async def handle_device_config(request: web.Request) -> web.Response:
    device_id = request.query.get("device_id", bridge_config_store.config.device_id).strip()
    # In un sistema multi-device cercheremmo la config specifica, per ora usiamo quella globale
    c = bridge_config_store.config
    return web.json_response({
        "device_id": device_id,
        "led_idle": {"r": c.led_idle_color[0], "g": c.led_idle_color[1], "b": c.led_idle_color[2], "brightness": c.led_idle_brightness},
        "led_listening": {"r": c.led_listening_color[0], "g": c.led_listening_color[1], "b": c.led_listening_color[2], "brightness": 70},
        "led_thinking": {"r": c.led_thinking_color[0], "g": c.led_thinking_color[1], "b": c.led_thinking_color[2], "brightness": 70},
        "led_speaking": {"r": c.led_speaking_color[0], "g": c.led_speaking_color[1], "b": c.led_speaking_color[2], "brightness": 75},
        "led_error": {"r": c.led_error_color[0], "g": c.led_error_color[1], "b": c.led_error_color[2], "brightness": 80},
    })


async def handle_companion_transcribe(request: web.Request) -> web.Response:
    try:
        data = await request.json()
    except json.JSONDecodeError:
        return web.json_response({"error": "JSON non valido"}, status=400)

    if not isinstance(data, dict):
        return web.json_response({"error": "Payload non valido"}, status=400)

    audio_base64 = str(data.get("audio_base64", "")).strip()
    language = str(data.get("language", "")).strip()
    if not audio_base64:
        return web.json_response({"error": "audio_base64 mancante"}, status=400)

    try:
        wav_bytes = base64.b64decode(audio_base64)
    except ValueError:
        return web.json_response({"error": "audio_base64 non valido"}, status=400)

    try:
        transcript = transcribe_wav_bytes(wav_bytes, language=language)
    except Exception as exc:
        logger.exception("Errore STT companion")
        return web.json_response({"error": f"Trascrizione fallita: {exc}"}, status=500)

    if not transcript:
        return web.json_response({"transcript": "", "status": "empty"})

    logger.info("Companion transcript: %s", transcript)
    return web.json_response({"transcript": transcript, "status": "ok"})


async def handle_companion_chat(request: web.Request) -> web.Response:
    try:
        data = await request.json()
    except json.JSONDecodeError:
        return web.json_response({"error": "JSON non valido"}, status=400)

    if not isinstance(data, dict):
        return web.json_response({"error": "Payload non valido"}, status=400)

    text = str(data.get("text", "")).strip()
    if not text:
        return web.json_response({"error": "text mancante"}, status=400)

    config = bridge_config_store.config
    agent_url = str(data.get("agent_url", config.agent_url)).strip() or config.agent_url
    model = str(data.get("model", config.model)).strip() or config.model
    system_prompt = str(data.get("system_prompt", config.system_prompt)).strip() or config.system_prompt
    temperature = float(data.get("temperature", config.temperature))
    max_sentences = max(1, int(data.get("max_response_sentences", config.max_response_sentences)))
    max_chars = max(80, int(data.get("max_response_chars", config.max_response_chars)))
    speak = bool(data.get("speak", True))
    device_id = str(data.get("device_id", "desktop-companion")).strip() or "desktop-companion"
    tts_provider = str(data.get("tts_provider", config.tts_provider)).strip().lower() or config.tts_provider
    tts_voice = str(data.get("tts_voice", config.tts_voice)).strip() or config.tts_voice

    try:
        response_text = await query_gemcode_with_options(
            text,
            agent_url=agent_url,
            model=model,
            system_prompt=system_prompt,
            temperature=temperature,
            max_sentences=max_sentences,
            max_chars=max_chars,
        )
    except asyncio.TimeoutError:
        return web.json_response({"error": "GemCode non ha risposto in tempo"}, status=504)
    except Exception as exc:
        logger.exception("Errore companion chat")
        return web.json_response({"error": f"Chat fallita: {exc}"}, status=500)

    audio_name = ""
    audio_url = ""
    if speak:
        try:
            audio_name = await synthesize_text_to_audio(response_text, device_id, tts_provider, tts_voice)
            audio_url = f"http://{bridge_state.public_host}:{HTTP_PORT}/audio/{audio_name}"
        except Exception as exc:
            logger.exception("Errore TTS companion")
            return web.json_response(
                {
                    "response_text": response_text,
                    "audio_url": "",
                    "audio_name": "",
                    "warning": f"TTS fallito: {exc}",
                },
                status=200,
            )

    logger.info("Companion response: %s", response_text)
    return web.json_response(
        {
            "status": "ok",
            "response_text": response_text,
            "audio_url": audio_url,
            "audio_name": audio_name,
            "tts_provider": tts_provider,
            "tts_voice": tts_voice,
        }
    )


async def handle_audio(request: web.Request) -> web.Response:
    audio_name = request.match_info["audio_name"]
    audio_path = VOICE_AUDIO_DIR / audio_name
    if not audio_path.exists():
        raise web.HTTPNotFound(text="audio non trovato")
    return web.FileResponse(audio_path)


@web.middleware
async def cors_middleware(request: web.Request, handler):
    if request.method == "OPTIONS":
        response = web.Response(status=200)
    else:
        response = await handler(request)

    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response


# ═══════════════════════════════════════════════════════
# VAM AICompanion.cs COMPATIBLE ENDPOINTS
# These match the protocol expected by the VAM plugin
# ═══════════════════════════════════════════════════════

# Pending responses queue (from Electron Studio → VAM)
_vam_pending_responses: deque = deque(maxlen=20)

# Overlay state (synced from Electron companion)
_vam_overlay_state = {"version": 0, "desktop_mode": True, "click_through": False}

# ═══════════════════════════════════════════════════════
# VAM Package Scanner — always up-to-date lists of
# characters, clothing, hair from .var packages
# ═══════════════════════════════════════════════════════

import zipfile

VAM_ADDON_DIR = Path("D:/AddonPackages")
VAM_SCENES_DIR = Path("D:/Saves/scene")
_vam_packages_cache: dict = {}
_vam_packages_cache_mtime: float = 0.0


def _scan_vam_packages() -> dict:
    """Scan all .var packages and categorize by content type."""
    global _vam_packages_cache, _vam_packages_cache_mtime

    if not VAM_ADDON_DIR.exists():
        return {"character": [], "clothing": [], "hair": [], "morph": [],
                "scene": [], "plugin": [], "other": [], "total": 0, "error": "AddonPackages dir not found"}

    # Check if any file changed since last scan (fast mtime check on directory)
    dir_mtime = VAM_ADDON_DIR.stat().st_mtime
    if dir_mtime == _vam_packages_cache_mtime and _vam_packages_cache:
        return _vam_packages_cache

    categories: dict[str, list] = {
        "character": [], "clothing": [], "hair": [],
        "morph": [], "scene": [], "plugin": [], "other": []
    }

    for var_file in sorted(VAM_ADDON_DIR.iterdir()):
        if not var_file.suffix == ".var":
            continue
        try:
            with zipfile.ZipFile(var_file) as z:
                names = z.namelist()
                # Read meta.json for display name
                meta = {}
                if "meta.json" in names:
                    try:
                        with z.open("meta.json") as mf:
                            meta = json.load(mf)
                    except Exception:
                        pass

                has_clothing = any("Custom/Clothing/" in n for n in names)
                has_hair = any("Custom/Hair/" in n for n in names)
                has_textures = any("Custom/Atom/Person/Textures/" in n for n in names)
                has_morphs = any("Morphs/" in n for n in names)
                has_scene = any("Saves/scene/" in n for n in names)
                has_plugin = any("Custom/Scripts/" in n for n in names)
                # Find preview image
                preview = next((n for n in names if n.endswith(".jpg") and "scene/" in n.lower()), "")

                entry = {
                    "file": var_file.name,
                    "creator": meta.get("creatorName", ""),
                    "name": meta.get("packageName", var_file.stem),
                    "description": meta.get("description", ""),
                    "preview": preview,
                    "size_mb": round(var_file.stat().st_size / 1048576, 1),
                }

                if has_clothing:
                    # Extract clothing item names
                    cloth_items = [n.split("/")[-1].rsplit(".", 1)[0]
                                   for n in names if "Custom/Clothing/" in n and n.endswith((".vaj", ".vam"))]
                    entry["items"] = cloth_items
                    categories["clothing"].append(entry)
                elif has_hair:
                    hair_items = [n.split("/")[-1].rsplit(".", 1)[0]
                                  for n in names if "Custom/Hair/" in n and n.endswith((".vaj", ".vam"))]
                    entry["items"] = hair_items
                    categories["hair"].append(entry)
                elif has_textures and has_morphs:
                    categories["character"].append(entry)
                elif has_textures:
                    categories["character"].append(entry)
                elif has_morphs:
                    categories["morph"].append(entry)
                elif has_scene:
                    categories["scene"].append(entry)
                elif has_plugin:
                    categories["plugin"].append(entry)
                else:
                    categories["other"].append(entry)
        except Exception:
            pass

    result = {
        **categories,
        "total": sum(len(v) for v in categories.values()),
        "scanned_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }
    _vam_packages_cache = result
    _vam_packages_cache_mtime = dir_mtime
    return result


def _scan_vam_scenes() -> list[dict]:
    """Scan scene JSON files in D:\\Saves\\scene for character data."""
    scenes = []
    if not VAM_SCENES_DIR.exists():
        return scenes
    for scene_dir in VAM_SCENES_DIR.iterdir():
        if not scene_dir.is_dir():
            continue
        for scene_file in scene_dir.glob("*.json"):
            preview = scene_file.with_suffix(".jpg")
            entry = {
                "file": str(scene_file),
                "name": scene_file.stem,
                "folder": scene_dir.name,
                "has_preview": preview.exists(),
                "preview_path": str(preview) if preview.exists() else "",
            }
            # Quick check for Person atoms
            try:
                with open(scene_file, "r", encoding="utf-8") as f:
                    raw = f.read(200000)  # read first 200KB for large scenes
                    entry["has_person"] = bool(re.search(r'"type"\s*:\s*"Person"', raw))
            except Exception:
                entry["has_person"] = False
            scenes.append(entry)
    return scenes


async def handle_vam_packages(request: web.Request) -> web.Response:
    """GET /api/vam/packages — returns categorized list of all .var packages."""
    category = request.query.get("category", "")
    result = _scan_vam_packages()
    if category and category in result:
        return web.json_response({"category": category, "items": result[category],
                                  "total": len(result[category])})
    return web.json_response(result)


async def handle_vam_scenes(request: web.Request) -> web.Response:
    """GET /api/vam/scenes — returns list of VAM scene files with Person atoms."""
    scenes = _scan_vam_scenes()
    return web.json_response({"scenes": scenes, "total": len(scenes)})


def _parse_emotion_and_actions(text: str) -> tuple[str, str, list[str]]:
    """Extract [emotion] and {action:gesture} tags from LLM response text."""
    emotion = "neutral"
    em = re.search(r"\[(neutral|smile|sad|angry|surprised|flirty|aroused|submissive)\]", text, re.I)
    if em:
        emotion = em.group(1).lower()
    actions = [m.group(1) for m in re.finditer(r"\{action\s*:\s*(\w+)\}", text, re.I)]
    clean = re.sub(r"\[(neutral|smile|sad|angry|surprised|flirty|aroused|submissive)\]", "", text, flags=re.I)
    clean = re.sub(r"\{action\s*:\s*\w+\}", "", clean).strip()
    clean = re.sub(r"\s{2,}", " ", clean)
    return clean, emotion, actions


async def handle_vam_chat_and_speak(request: web.Request) -> web.Response:
    """POST /chat-and-speak — VAM AICompanion.cs compatible endpoint."""
    try:
        data = await request.json()
    except json.JSONDecodeError:
        return web.json_response({"status": "error", "text": "JSON non valido"}, status=400)

    text = str(data.get("text", "")).strip()
    if not text:
        return web.json_response({"status": "error", "text": "testo mancante"}, status=400)

    config = bridge_config_store.config

    try:
        raw_response = await query_gemcode_with_options(
            text,
            agent_url=config.agent_url,
            model=config.model,
            system_prompt=config.system_prompt,
            temperature=config.temperature,
            max_sentences=config.max_response_sentences,
            max_chars=config.max_response_chars,
        )
    except Exception as exc:
        logger.exception("VAM chat error")
        return web.json_response({"status": "error", "text": str(exc)}, status=500)

    clean_text, emotion, actions = _parse_emotion_and_actions(raw_response)

    # TTS — generate audio and encode as base64 for VAM
    audio_base64 = ""
    audio_path = ""
    audio_path_abs = ""
    try:
        audio_name = await synthesize_text_to_audio(
            clean_text, "vam", config.tts_provider, config.tts_voice
        )
        abs_path = VOICE_AUDIO_DIR / audio_name
        audio_path = audio_name
        audio_path_abs = str(abs_path)
        audio_base64 = base64.b64encode(abs_path.read_bytes()).decode("ascii")
    except Exception as exc:
        logger.warning("VAM TTS failed: %s", exc)

    result = {
        "status": "ok",
        "text": clean_text,
        "emotion": emotion,
        "actions": actions,
        "audio_path": audio_path,
        "audio_path_abs": audio_path_abs,
        "audio_base64": audio_base64,
    }
    logger.info("VAM response: emotion=%s actions=%s text=%s", emotion, actions, clean_text[:80])
    return web.json_response(result)


async def handle_vam_next_response(request: web.Request) -> web.Response:
    """GET /next-response — VAM polls this for responses pushed from Electron Studio."""
    if _vam_pending_responses:
        resp = _vam_pending_responses.popleft()
        return web.json_response(resp)
    return web.json_response({"status": "empty"})


async def handle_vam_overlay_state(request: web.Request) -> web.Response:
    """GET /overlay-state — VAM syncs desktop transparency state."""
    return web.json_response(_vam_overlay_state)


async def handle_vam_listen(request: web.Request) -> web.Response:
    """GET /listen — VAM triggers STT via bridge mic."""
    try:
        # Record from mic and transcribe
        config = bridge_config_store.config
        # Simple approach: use existing whisper model
        # For now return empty — full mic capture requires platform-specific code
        return web.json_response({"text": "", "status": "no_mic"})
    except Exception as exc:
        return web.json_response({"text": "", "error": str(exc)})


async def handle_vam_push_response(request: web.Request) -> web.Response:
    """POST /push-response — Electron Studio pushes a response for VAM to pick up."""
    try:
        data = await request.json()
    except json.JSONDecodeError:
        return web.json_response({"error": "JSON non valido"}, status=400)
    _vam_pending_responses.append(data)
    return web.json_response({"status": "queued", "pending": len(_vam_pending_responses)})


async def handle_vam_set_overlay(request: web.Request) -> web.Response:
    """POST /overlay-state — Electron Studio updates overlay state."""
    try:
        data = await request.json()
    except json.JSONDecodeError:
        return web.json_response({"error": "JSON non valido"}, status=400)
    _vam_overlay_state["version"] = _vam_overlay_state.get("version", 0) + 1
    if "desktop_mode" in data:
        _vam_overlay_state["desktop_mode"] = bool(data["desktop_mode"])
    if "click_through" in data:
        _vam_overlay_state["click_through"] = bool(data["click_through"])
    return web.json_response(_vam_overlay_state)


async def handle_index(request: web.Request) -> web.Response:
    return web.json_response({"name": "GemCode Voice Bridge", "status": "active", "api_version": "1.0"})


async def run_http_server() -> None:
    app = web.Application(middlewares=[cors_middleware])
    app.router.add_get("/", handle_index)
    app.router.add_get("/health", handle_health)
    app.router.add_get("/api/bridge/health", handle_bridge_health)
    app.router.add_post("/api/companion/chat", handle_companion_chat)
    app.router.add_post("/api/companion/transcribe", handle_companion_transcribe)
    app.router.add_get("/api/voice/session", handle_voice_session)
    app.router.add_get("/api/device/ping", handle_device_ping)
    app.router.add_get("/api/device/status", handle_device_status)
    app.router.add_get("/api/devices", handle_devices)
    app.router.add_get("/api/device/config", handle_device_config)
    app.router.add_get("/api/settings", handle_settings)
    app.router.add_post("/api/settings", handle_settings)
    app.router.add_post("/api/device/led", handle_device_led)
    app.router.add_get("/audio/{audio_name}", handle_audio)
    # VAM AICompanion.cs compatible endpoints
    app.router.add_post("/chat-and-speak", handle_vam_chat_and_speak)
    app.router.add_get("/next-response", handle_vam_next_response)
    app.router.add_get("/overlay-state", handle_vam_overlay_state)
    app.router.add_post("/overlay-state", handle_vam_set_overlay)
    app.router.add_get("/listen", handle_vam_listen)
    app.router.add_post("/push-response", handle_vam_push_response)
    # VAM package/scene scanner endpoints
    app.router.add_get("/api/vam/packages", handle_vam_packages)
    app.router.add_get("/api/vam/scenes", handle_vam_scenes)

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, HOST, HTTP_PORT)
    await site.start()
    logger.info("GemCode HTTP bridge attivo su %s:%s", HOST, HTTP_PORT)
    await asyncio.Event().wait()


async def run_udp_server(port: int, protocol_factory) -> None:
    loop = asyncio.get_running_loop()
    transport, _ = await loop.create_datagram_endpoint(protocol_factory, local_addr=(HOST, port))
    logger.info("GemCode UDP listener attivo su %s:%s", HOST, port)
    try:
        await asyncio.Event().wait()
    finally:
        transport.close()


class GemCodeHandler(AsyncEventHandler):
    def __init__(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        super().__init__(reader, writer)
        self.audio_buffer = bytearray()
        self.audio_rate: int = AUDIO_RATE

    async def handle_event(self, event: Event) -> bool:
        if Describe.is_type(event.type):
            await self.write_event(_WYOMING_INFO.event())
            return True

        if Transcribe.is_type(event.type):
            logger.info("Sessione ASR avviata (Transcribe ricevuto)")
            self.audio_buffer = bytearray()
            return True

        if AudioStart.is_type(event.type):
            chunk = AudioStart.from_event(event)
            self.audio_rate = chunk.rate
            self.audio_buffer = bytearray()
            logger.info(f"Audio stream avviato ({self.audio_rate}Hz)")
            return True

        if AudioChunk.is_type(event.type):
            chunk = AudioChunk.from_event(event)
            self.audio_buffer.extend(chunk.audio)
            return True

        if AudioStop.is_type(event.type):
            logger.info(f"Audio stream terminato ({len(self.audio_buffer)} bytes). Trascrivo...")

            wav_io = io.BytesIO(
                build_wav_bytes(
                    bytes(self.audio_buffer),
                    sample_rate=self.audio_rate,
                    sample_width=AUDIO_WIDTH,
                    channels=AUDIO_CHANNELS,
                )
            )
            segments, _ = stt_model.transcribe(wav_io, language=WHISPER_LANGUAGE)
            text = " ".join(s.text for s in segments).strip()
            logger.info(f"Utente ha detto: '{text}'")

            await self.write_event(Transcript(text=text).event())

            if text:
                await self.process_command(text)
            return False

        if Synthesize.is_type(event.type):
            synthesize = Synthesize.from_event(event)
            logger.info(f"Richiesta TTS: '{synthesize.text}'")
            await self.speak(synthesize.text)
            return False

        return True

    async def process_command(self, text: str):
        try:
            logger.info("Invio a GemCode Agent: %s", bridge_config_store.config.agent_url)
            response_text = await query_gemcode(text)
            logger.info(f"Risposta GemCode: {response_text}")
            await self.speak(response_text)
        except Exception as exc:
            logger.error(f"Comunicazione con GemCode fallita: {exc}")

    async def speak(self, text: str):
        logger.info(f"Generazione TTS: {text}")
        config = bridge_config_store.config

        if config.tts_provider == "windows-sapi":
            audio_name = f"wyoming-{uuid.uuid4().hex}.wav"
            output_path = VOICE_AUDIO_DIR / audio_name
            await synthesize_with_windows_sapi(text, config.tts_voice, output_path)
            try:
                await stream_wav_file(self, output_path)
            finally:
                output_path.unlink(missing_ok=True)
            return

        if edge_tts is None:
            raise RuntimeError("edge-tts non e installato e il provider TTS configurato non e disponibile")

        communicate = edge_tts.Communicate(text, config.tts_voice)
        await self.write_event(AudioStart(rate=24000, width=2, channels=1).event())
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                await self.write_event(AudioChunk(audio=chunk["data"]).event())
        await self.write_event(AudioStop().event())

async def main():
    # Pre-register default device to avoid 404 in UI
    config = bridge_config_store.config
    await bridge_state.mark_device_seen(
        device_id=config.device_id,
        remote_ip="127.0.0.1",
        firmware_mode=config.device_mode,
        wake_word_label=config.wake_word_label,
        wake_word_model=config.wake_word_model,
        device_name=config.device_name,
    )

    server = AsyncTcpServer(HOST, WYOMING_PORT)
    logger.info(f"GemCode Wyoming Bridge attivo su {HOST}:{WYOMING_PORT}")
    await asyncio.gather(
        server.run(GemCodeHandler),
        run_http_server(),
        run_udp_server(UDP_AUDIO_PORT, AudioProtocol),
        run_udp_server(UDP_CONTROL_PORT, ControlProtocol),
        bridge_state.cleanup_expired(),
    )

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
